"""
Submission API Endpoints
POST   /api/v1/submissions              — Код илгээх → Celery Judge Queue
GET    /api/v1/submissions/{id}         — Submission дүн авах (Polling)
GET    /api/v1/submissions/my           — Миний submissions (pagination)
GET    /api/v1/submissions/problem/{code} — Тухайн бодлогын submissions
GET    /api/v1/submissions/leaderboard/{code} — Бодлогын шилдэг шийдлүүд
"""
import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.celery_app import celery_app
from app.models.user import User
from app.models.problem import Problem
from app.models.submission import Submission, JudgeResult, SubmissionStatus
from app.models.progression import StudentProgress

router = APIRouter()


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class SubmissionCreate(BaseModel):
    problem_code: str
    language:     str       # "cpp", "python3", "java", "c"
    source_code:  str
    is_sample_test: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "problem_code": "BF101",
                "language": "cpp",
                "source_code": "#include<bits/stdc++.h>\nusing namespace std;\nint main(){int n; cin>>n; cout<<n; return 0;}",
            }
        }


class JudgeResultOut(BaseModel):
    id: int
    testcase_id: int
    status: str
    time_ms: float
    memory_kb: float
    output_log: Optional[str] = None
    actual_output: Optional[str] = None

    model_config = {"from_attributes": True}


class SubmissionOut(BaseModel):
    id: int
    problem_code: str
    language: str
    status: str
    score: int
    time_ms: float
    memory_kb: float
    submitted_at: datetime
    source_code: str
    judge_results: List[JudgeResultOut] = []

    model_config = {"from_attributes": True}


class SubmissionListItem(BaseModel):
    id: int
    problem_code: str
    language: str
    status: str
    score: int
    time_ms: float
    memory_kb: float
    submitted_at: datetime

    model_config = {"from_attributes": True}


# ─── Supported Languages ──────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = {
    # C++ versions
    "g++20":   "C++20 (GCC)",
    "g++23":   "C++23 (GCC)",
    "g++17":   "C++17 (GCC)",
    "g++14":   "C++14 (GCC)",
    "g++11":   "C++11 (GCC)",
    "cpp":     "C++17 (GCC)",
    "c++":     "C++17 (GCC)",
    "clang++": "C++17 (Clang)",
    # C versions
    "gcc":     "C11 (GCC)",
    "c":       "C11 (GCC)",
    "gcc11":   "C11 (GCC)",
    "gcc23":   "C23 (GCC)",
    "clang":   "C (Clang)",
    # Python versions
    "python3": "Python 3",
    "pypy3":   "PyPy 3",
    "python":  "Python 2",
    "pypy":    "PyPy 2",
    # Java versions
    "java":    "Java 17/21/25",
    "java8":   "Java 8",
    # Pascal
    "pascal":  "Pascal (FPC)",
    "fpc":     "Free Pascal",
    # Go
    "go":      "Go",
    # Rust
    "cargo":   "Rust (Cargo)",
    # JavaScript
    "node":    "JavaScript (Node.js)",
    # C#
    "mono-csc": "C# (Mono)",
    # Visual Languages for beginners
    "flowgorithm": "Flowgorithm Flowchart",
    "scratch": "Scratch Block Code",
}



# ─── POST /submissions ────────────────────────────────────────────────────────

@router.post(
    "/",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Код илгээх — Judge Queue-д оруулах",
)
async def submit_code(
    payload: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Language шалгах
    if payload.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Дэмжигдэхгүй хэл. Дэмжигдэх хэлүүд: {', '.join(SUPPORTED_LANGUAGES.keys())}",
        )

    # Бодлого хайх
    p_result = await db.execute(
        select(Problem).where(Problem.code == payload.problem_code.upper())
    )
    problem = p_result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    is_privileged = current_user.role.value in ("teacher", "admin")
    if not problem.is_visible and not is_privileged:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    # Source code хэмжээ шалгах (100KB max)
    if len(payload.source_code.encode("utf-8")) > 100 * 1024:
        raise HTTPException(status_code=400, detail="Кодын хэмжээ 100KB-аас хэтэрч байна.")

    # Submission DB-д хадгалах (PENDING статустай)
    sub = Submission(
        user_id=current_user.id,
        problem_id=problem.id,
        language=payload.language,
        source_code=payload.source_code,
        status=SubmissionStatus.PENDING,
        score=0,
        time_ms=0.0,
        memory_kb=0.0,
        is_sample_test=payload.is_sample_test,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    # User-controlled code must never execute inside the API process. Sample
    # runs use the same isolated judge queue as full submissions.
    celery_app.send_task(
        "app.workers.judge_worker.execute_submission",
        args=[sub.id],
        queue="judge_queue",
    )
    return {
        "submission_id": sub.id,
        "status": sub.status.value,
        "message": "Илгээлтийг хүлээн авч, тусгаарлагдсан Judge Queue-д орууллаа.",
        "poll_url": f"/api/v1/submissions/{sub.id}",
    }

# ─── GET /submissions/{id} ────────────────────────────────────────────────────

@router.get(
    "/{submission_id}",
    summary="Submission-ийн дүн авах (Polling эсвэл WebSocket-д ашиглагдана)",
)
async def get_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.judge_results))
        .where(Submission.id == submission_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission олдсонгүй.")

    # Зөвхөн өөрийнхөө эсвэл teacher/admin харна
    if sub.user_id != current_user.id and current_user.role.value not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Харах эрхгүй байна.")

    # Problem code авах
    p_result = await db.execute(select(Problem).where(Problem.id == sub.problem_id))
    problem = p_result.scalar_one_or_none()

    # Build batches from init.yml if it exists
    batches = []
    is_batched = False
    
    if problem:
        import yaml
        from pathlib import Path
        init_path = Path("/problems") / f"oj-{problem.code}" / "init.yml"
        if init_path.exists():
            try:
                with open(init_path, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                test_cases_cfg = cfg.get("test_cases", [])
                
                # Check if there is any batched structure
                for item in test_cases_cfg:
                    if isinstance(item, dict) and ("batched" in item or "cases" in item):
                        is_batched = True
                        break
                
                sorted_results = sorted(sub.judge_results, key=lambda r: r.id)
                current_res_idx = 0
                
                # If submission is pending or running, show status as PENDING/RUNNING instead of SKIPPED
                fallback_status = sub.status.value if sub.status.value in ("PENDING", "RUNNING") else "SKIPPED"
                
                if is_batched:
                    for b_idx, item in enumerate(test_cases_cfg, start=1):
                        if not isinstance(item, dict):
                            continue
                        sub_cases = item.get("batched") or item.get("cases") or []
                        if not isinstance(sub_cases, list):
                            continue
                        
                        batch_points = item.get("points", 0)
                        cases_list = []
                        batch_status = "AC"
                        batch_earned_points = batch_points
                        
                        for tc_cfg in sub_cases:
                            if not isinstance(tc_cfg, dict):
                                continue
                            
                            if current_res_idx < len(sorted_results):
                                jr = sorted_results[current_res_idx]
                                current_res_idx += 1
                                status = jr.status.value
                                if status != "AC":
                                    batch_status = status
                                    batch_earned_points = 0
                                    
                                cases_list.append({
                                    "id": jr.id,
                                    "testcase_id": jr.testcase_id,
                                    "status": status,
                                    "time_ms": jr.time_ms,
                                    "memory_kb": jr.memory_kb,
                                    "output_log": jr.output_log,
                                    "actual_output": jr.actual_output,
                                    "points": tc_cfg.get("points", 0),
                                    "in_file": tc_cfg.get("in"),
                                    "out_file": tc_cfg.get("out"),
                                    "sample": tc_cfg.get("sample", False)
                                })
                            else:
                                batch_earned_points = 0
                                if batch_status == "AC":
                                    batch_status = fallback_status
                                cases_list.append({
                                    "id": None,
                                    "testcase_id": None,
                                    "status": fallback_status,
                                    "time_ms": 0,
                                    "memory_kb": 0,
                                    "output_log": None,
                                    "actual_output": None,
                                    "points": tc_cfg.get("points", 0),
                                    "in_file": tc_cfg.get("in"),
                                    "out_file": tc_cfg.get("out"),
                                    "sample": tc_cfg.get("sample", False)
                                })
                        
                        if any(c["status"] != "AC" for c in cases_list):
                            batch_earned_points = 0
                            non_ac_statuses = [c["status"] for c in cases_list if c["status"] != "AC"]
                            if non_ac_statuses:
                                batch_status = non_ac_statuses[0]
                        
                        batches.append({
                            "batch_index": b_idx,
                            "points": batch_earned_points,
                            "total_points": batch_points,
                            "status": batch_status,
                            "cases": cases_list
                        })
                else:
                    # Flat problem
                    for b_idx, tc_cfg in enumerate(test_cases_cfg, start=1):
                        if not isinstance(tc_cfg, dict):
                            continue
                        
                        batch_points = tc_cfg.get("points", 10)
                        cases_list = []
                        batch_status = "AC"
                        batch_earned_points = batch_points
                        
                        if current_res_idx < len(sorted_results):
                            jr = sorted_results[current_res_idx]
                            current_res_idx += 1
                            status = jr.status.value
                            if status != "AC":
                                batch_status = status
                                batch_earned_points = 0
                                
                            cases_list.append({
                                "id": jr.id,
                                "testcase_id": jr.testcase_id,
                                "status": status,
                                "time_ms": jr.time_ms,
                                "memory_kb": jr.memory_kb,
                                "output_log": jr.output_log,
                                "actual_output": jr.actual_output,
                                "points": batch_points,
                                "in_file": tc_cfg.get("in"),
                                "out_file": tc_cfg.get("out"),
                                "sample": tc_cfg.get("sample", False)
                            })
                        else:
                            batch_earned_points = 0
                            batch_status = fallback_status
                            cases_list.append({
                                "id": None,
                                "testcase_id": None,
                                "status": fallback_status,
                                "time_ms": 0,
                                "memory_kb": 0,
                                "output_log": None,
                                "actual_output": None,
                                "points": batch_points,
                                "in_file": tc_cfg.get("in"),
                                "out_file": tc_cfg.get("out"),
                                "sample": tc_cfg.get("sample", False)
                            })
                            
                        batches.append({
                            "batch_index": b_idx,
                            "points": batch_earned_points,
                            "total_points": batch_points,
                            "status": batch_status,
                            "cases": cases_list
                        })
            except Exception as e:
                import logging
                logging.getLogger("oj.api").error(f"Failed to build batches from init.yml: {e}")

    return {
        "id":           sub.id,
        "problem_code": problem.code if problem else "?",
        "language":     sub.language,
        "status":       sub.status.value,
        "score":        sub.score,
        "time_ms":      sub.time_ms,
        "memory_kb":    sub.memory_kb,
        "error_log":    sub.error_log,
        "source_code":  sub.source_code,
        "submitted_at": sub.submitted_at.isoformat(),
        "is_pending":   sub.status in (SubmissionStatus.PENDING, SubmissionStatus.RUNNING),
        "is_batched":   is_batched,
        "batches":      batches,
        "judge_results": [
            {
                "id":          jr.id,
                "testcase_id": jr.testcase_id,
                "status":      jr.status.value,
                "time_ms":     jr.time_ms,
                "memory_kb":   jr.memory_kb,
                "output_log":  jr.output_log,
                "actual_output": jr.actual_output,
            }
            for jr in sorted(sub.judge_results, key=lambda r: r.id)
        ],
    }


# ─── GET /submissions/my ──────────────────────────────────────────────────────

@router.get(
    "/my/list",
    summary="Миний submissions (pagination)",
)
async def get_my_submissions(
    problem_code: Optional[str] = Query(None),
    lang:         Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    skip:  int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Submission).where(Submission.user_id == current_user.id)

    if lang:
        query = query.where(Submission.language == lang)
    if status_filter:
        try:
            query = query.where(Submission.status == SubmissionStatus(status_filter))
        except ValueError:
            pass

    if problem_code:
        p_result = await db.execute(select(Problem).where(Problem.code == problem_code.upper()))
        p = p_result.scalar_one_or_none()
        if p:
            query = query.where(Submission.problem_id == p.id)

    query = query.order_by(Submission.submitted_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    subs = result.scalars().all()

    # Batch load problem codes
    problem_ids = list({s.problem_id for s in subs})
    p_result = await db.execute(select(Problem).where(Problem.id.in_(problem_ids)))
    problem_map = {p.id: p.code for p in p_result.scalars().all()}

    return [
        {
            "id":           s.id,
            "problem_code": problem_map.get(s.problem_id, "?"),
            "language":     s.language,
            "status":       s.status.value,
            "score":        s.score,
            "time_ms":      s.time_ms,
            "memory_kb":    s.memory_kb,
            "submitted_at": s.submitted_at.isoformat(),
        }
        for s in subs
    ]


# ─── GET /submissions/problem/{code} ─────────────────────────────────────────

@router.get(
    "/problem/{code}",
    summary="Тухайн бодлогын нийт submissions (Teacher / Admin)",
)
async def get_problem_submissions(
    code:   str,
    skip:   int = Query(0, ge=0),
    limit:  int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    p_result = await db.execute(select(Problem).where(Problem.code == code.upper()))
    problem = p_result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    result = await db.execute(
        select(Submission)
        .where(Submission.problem_id == problem.id)
        .order_by(Submission.submitted_at.desc())
        .offset(skip).limit(limit)
    )
    subs = result.scalars().all()

    return [
        {
            "id":           s.id,
            "user_id":      str(s.user_id),
            "language":     s.language,
            "status":       s.status.value,
            "score":        s.score,
            "time_ms":      s.time_ms,
            "memory_kb":    s.memory_kb,
            "submitted_at": s.submitted_at.isoformat(),
        }
        for s in subs
    ]


# ─── GET /submissions/leaderboard/{code} ─────────────────────────────────────

@router.get(
    "/leaderboard/{code}",
    summary="Бодлогын шилдэг AC шийдлүүдийн жагсаалт (хурдаар эрэмбэлэгдсэн)",
)
async def get_problem_leaderboard(
    code:  str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    p_result = await db.execute(select(Problem).where(Problem.code == code.upper()))
    problem = p_result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.user))
        .where(
            and_(
                Submission.problem_id == problem.id,
                Submission.status == SubmissionStatus.ACCEPTED,
            )
        )
        .order_by(Submission.time_ms.asc(), Submission.submitted_at.asc())
        .limit(limit)
    )
    subs = result.scalars().all()

    return [
        {
            "rank":         idx + 1,
            "submission_id": s.id,
            "username":     s.user.username if s.user else "?",
            "full_name":    s.user.full_name if s.user else None,
            "avatar_url":   s.user.avatar_url if s.user else None,
            "language":     s.language,
            "score":        s.score,
            "time_ms":      s.time_ms,
            "memory_kb":    s.memory_kb,
            "submitted_at": s.submitted_at.isoformat(),
        }
        for idx, s in enumerate(subs)
    ]
