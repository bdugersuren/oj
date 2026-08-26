"""
Problem & TestCase CRUD API
GET    /api/v1/problems              — Жагсаалт (Filter, Pagination, Search)
GET    /api/v1/problems/{code}       — Дэлгэрэнгүй + Sample Testcases + Hints
POST   /api/v1/problems              — Шинэ бодлого үүсгэх (teacher / admin)
PUT    /api/v1/problems/{code}       — Бодлого засах (teacher / admin)
DELETE /api/v1/problems/{code}       — Бодлого устгах (admin)

POST   /api/v1/problems/{code}/testcases         — Testcase нэмэх
DELETE /api/v1/problems/{code}/testcases/{tc_id} — Testcase устгах

GET    /api/v1/problems/{code}/hints  — Hint жагсаалт (auth)
POST   /api/v1/problems/{code}/hints  — Hint нэмэх (teacher / admin)

GET    /api/v1/problems/{code}/stats  — Бодлогын нийт статистик
"""
import anyio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, field_validator

from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_user, require_role, get_current_user_optional
from app.services.storage import storage_client
from app.models.user import User, UserRole
from app.models.problem import Problem, TestCase, ProblemHint, DifficultyLevel, OlympiadScope, DivisionCategory
from app.models.submission import Submission, SubmissionStatus

router = APIRouter()


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TestCaseOut(BaseModel):
    id: int
    input_data: str
    output_data: str
    points: int
    order: int
    is_sample: bool

    model_config = {"from_attributes": True}


class HintOut(BaseModel):
    id: int
    level: int
    title: str
    hint_text: str
    xp_penalty: int

    model_config = {"from_attributes": True}


class ProblemListItem(BaseModel):
    id: int
    code: str
    title: str
    points: int
    xp_reward: int
    difficulty: DifficultyLevel
    topic: str
    time_limit: float
    memory_limit: int
    olympiad_scope: OlympiadScope
    division: DivisionCategory
    olympiad_year: Optional[int] = None
    source_citation: Optional[str] = None
    is_visible: bool
    testcase_count: int = 0
    accepted_count: int = 0
    total_submissions: int = 0
    solved_status: str = "unsolved"

    model_config = {"from_attributes": True}


class RunSamplesRequest(BaseModel):
    language: str
    source_code: str

class TestCaseResultOut(BaseModel):
    testcase_id: int
    status: str
    time_ms: float
    memory_kb: float
    actual_output: Optional[str] = None
    checker_output: Optional[str] = None

class RunSamplesResponse(BaseModel):
    status: str
    time_ms: float
    memory_kb: float
    testcases: List[TestCaseResultOut]


class ProblemDetail(BaseModel):
    id: int
    code: str
    title: str
    statement_markdown: str
    statement_pdf_path: Optional[str] = None
    points: int
    xp_reward: int
    difficulty: DifficultyLevel
    topic: str
    time_limit: float
    memory_limit: int
    olympiad_scope: OlympiadScope
    division: DivisionCategory
    olympiad_year: Optional[int] = None
    source_citation: Optional[str] = None
    is_visible: bool
    sample_testcases: List[TestCaseOut] = []
    hints: List[HintOut] = []
    testcase_count: int = 0
    accepted_count: int = 0
    total_submissions: int = 0

    model_config = {"from_attributes": True}


class ProblemCreate(BaseModel):
    code: str
    title: str
    statement_markdown: str
    time_limit: float = 1.0
    memory_limit: int = 64
    points: int = 10
    xp_reward: int = 20
    difficulty: DifficultyLevel = DifficultyLevel.BRONZE
    topic: str = "Brute Force"
    olympiad_scope: OlympiadScope = OlympiadScope.TRAINING
    division: DivisionCategory = DivisionCategory.SENIOR
    olympiad_year: Optional[int] = None
    source_citation: Optional[str] = None

    @field_validator("code")
    @classmethod
    def code_format(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Бодлогын код зөвхөн үсэг, тоо агуулна (жишээ: BF101, 1001)")
        return v

    @field_validator("time_limit")
    @classmethod
    def time_limit_range(cls, v: float) -> float:
        if not 0.1 <= v <= 10.0:
            raise ValueError("Цагийн хязгаар 0.1 – 10.0 секунд байх ёстой.")
        return v


class ProblemUpdate(BaseModel):
    title: Optional[str] = None
    statement_markdown: Optional[str] = None
    time_limit: Optional[float] = None
    memory_limit: Optional[int] = None
    points: Optional[int] = None
    xp_reward: Optional[int] = None
    difficulty: Optional[DifficultyLevel] = None
    topic: Optional[str] = None
    olympiad_scope: Optional[OlympiadScope] = None
    division: Optional[DivisionCategory] = None
    olympiad_year: Optional[int] = None
    source_citation: Optional[str] = None
    is_visible: Optional[bool] = None


class TestCaseCreate(BaseModel):
    input_data: str
    output_data: str
    points: int = 10
    order: int = 1
    is_sample: bool = False


class HintCreate(BaseModel):
    level: int        # 1 | 2 | 3
    title: str
    hint_text: str
    xp_penalty: int = 5

    @field_validator("level")
    @classmethod
    def level_range(cls, v: int) -> int:
        if v not in (1, 2, 3):
            raise ValueError("Hint level 1, 2, эсвэл 3 байх ёстой.")
        return v


# ─── Helper ───────────────────────────────────────────────────────────────────

async def _get_problem_or_404(code: str, db: AsyncSession) -> Problem:
    result = await db.execute(
        select(Problem)
        .options(
            selectinload(Problem.test_cases),
            selectinload(Problem.hints),
        )
        .where(Problem.code == code)
    )
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail=f"'{code}' кодтой бодлого олдсонгүй.")
    return problem


async def _submission_stats(problem_id: int, db: AsyncSession) -> dict:
    total_q = await db.execute(
        select(func.count()).where(Submission.problem_id == problem_id)
    )
    ac_q = await db.execute(
        select(func.count()).where(
            and_(
                Submission.problem_id == problem_id,
                Submission.status == SubmissionStatus.ACCEPTED,
            )
        )
    )
    return {
        "total_submissions": total_q.scalar_one() or 0,
        "accepted_count":    ac_q.scalar_one() or 0,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=List[ProblemListItem],
    summary="Бодлогуудын жагсаалт (Filter + Pagination + Search)",
)
async def list_problems(
    topic:      Optional[str]             = Query(None, description="Алгоритмын сэдвээр шүүх"),
    difficulty: Optional[DifficultyLevel] = Query(None, description="Хүндрэлийн түвшин"),
    scope:      Optional[OlympiadScope]   = Query(None, description="Олимпиадын хамрах хүрээ"),
    division:   Optional[DivisionCategory]= Query(None, description="Ангиллал"),
    search:     Optional[str]             = Query(None, description="Код эсвэл гарчгаар хайх"),
    visible_only: bool                    = Query(True),
    skip:       int                       = Query(0, ge=0),
    limit:      int                       = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    # Force visible_only = True for students or unauthenticated users
    is_privileged = current_user and current_user.role.value in ("teacher", "admin")
    if not is_privileged:
        visible_only = True

    query = select(Problem)
    if visible_only:
        query = query.where(Problem.is_visible == True)
    if topic and topic != "Бүгд":
        query = query.where(Problem.topic == topic)
    if difficulty:
        query = query.where(Problem.difficulty == difficulty)
    if scope:
        query = query.where(Problem.olympiad_scope == scope)
    if division:
        query = query.where(Problem.division == division)
    if search:
        query = query.where(
            Problem.title.ilike(f"%{search}%") | Problem.code.ilike(f"%{search}%")
        )

    query = query.order_by(Problem.code).offset(skip).limit(limit)
    result = await db.execute(query)
    problems = result.scalars().all()

    # Хэрэглэгчийн бодсон/оролдсон төлөвийг авах
    user_status_map = {}
    if current_user and problems:
        p_ids = [p.id for p in problems]
        sub_res = await db.execute(
            select(Submission.problem_id, Submission.status)
            .where(Submission.user_id == current_user.id, Submission.problem_id.in_(p_ids))
        )
        for pid, status in sub_res.all():
            if user_status_map.get(pid) != "solved":
                if status == SubmissionStatus.ACCEPTED:
                    user_status_map[pid] = "solved"
                else:
                    user_status_map[pid] = "attempted"

    items = []
    for p in problems:
        stats = await _submission_stats(p.id, db)
        tc_count = await db.execute(
            select(func.count()).where(TestCase.problem_id == p.id)
        )
        items.append({
            **p.__dict__,
            "testcase_count":   tc_count.scalar_one() or 0,
            **stats,
            "solved_status": user_status_map.get(p.id, "unsolved"),
        })
    return items


@router.get(
    "/{code}",
    response_model=ProblemDetail,
    summary="Бодлогын дэлгэрэнгүй мэдээлэл + Sample Testcase + Hints",
)
async def get_problem(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    problem = await _get_problem_or_404(code, db)
    is_privileged = current_user and current_user.role.value in ("teacher", "admin")
    if not problem.is_visible and not is_privileged:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    stats = await _submission_stats(problem.id, db)
    sample_cases = [tc for tc in problem.test_cases if tc.is_sample]

    return {
        **problem.__dict__,
        "sample_testcases": sample_cases,
        "hints":            problem.hints,
        "testcase_count":   len(problem.test_cases),
        **stats,
    }


@router.post(
    "/",
    response_model=ProblemDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Шинэ бодлого үүсгэх (Teacher / Admin)",
)
async def create_problem(
    payload: ProblemCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    # Duplicate code шалгах
    existing = await db.execute(select(Problem).where(Problem.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{payload.code}' кодтой бодлого аль хэдийн бүртгэлтэй байна.",
        )

    problem = Problem(**payload.model_dump(), created_by_id=current_user.id)
    db.add(problem)
    await db.commit()
    await db.refresh(problem)

    return {
        **problem.__dict__,
        "sample_testcases": [],
        "hints":            [],
        "testcase_count":   0,
        "accepted_count":   0,
        "total_submissions": 0,
    }


@router.put(
    "/{code}",
    response_model=ProblemDetail,
    summary="Бодлого засах (Teacher / Admin)",
)
async def update_problem(
    code: str,
    payload: ProblemUpdate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    problem = await _get_problem_or_404(code, db)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(problem, field, value)

    await db.commit()
    await db.refresh(problem)

    stats = await _submission_stats(problem.id, db)
    sample_cases = [tc for tc in problem.test_cases if tc.is_sample]
    return {
        **problem.__dict__,
        "sample_testcases": sample_cases,
        "hints":            problem.hints,
        "testcase_count":   len(problem.test_cases),
        **stats,
    }


@router.delete(
    "/{code}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Бодлого устгах (Admin эсвэл өөрийн уусгасан бодлого Teacher)",
)
async def delete_problem(
    code: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    problem = await _get_problem_or_404(code, db)
    # Багш зөвхөн өөрийн үүсгэсэн бодлогоо л устгаж болно; admin бол бүгдийг
    if current_user.role == UserRole.TEACHER and problem.created_by_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Та зөвхөн өөрийн үүсгэсэн бодлогыгг л устгах боломжтой.",
        )
    await db.delete(problem)
    await db.commit()
    return None


# ─── Testcase Endpoints ───────────────────────────────────────────────────────

@router.get(
    "/{code}/testcases",
    response_model=List[TestCaseOut],
    summary="Бодлогын бүх тест кейс (Teacher / Admin)",
)
async def list_testcases(
    code: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    problem = await _get_problem_or_404(code, db)
    return sorted(problem.test_cases, key=lambda t: t.order)


@router.post(
    "/{code}/testcases",
    response_model=TestCaseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Тест кейс нэмэх (Teacher / Admin)",
)
async def add_testcase(
    code: str,
    payload: TestCaseCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    problem = await _get_problem_or_404(code, db)
    tc = TestCase(problem_id=problem.id, **payload.model_dump())
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc


@router.delete(
    "/{code}/testcases/{tc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Тест кейс устгах (Teacher / Admin)",
)
async def delete_testcase(
    code: str,
    tc_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TestCase).where(TestCase.id == tc_id)
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Тест кейс олдсонгүй.")
    await db.delete(tc)
    await db.commit()
    return None


@router.put(
    "/{code}/testcases/{tc_id}",
    response_model=TestCaseOut,
    summary="Тест кейс засах (Teacher / Admin)",
)
async def update_testcase(
    code: str,
    tc_id: int,
    payload: TestCaseCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TestCase).where(TestCase.id == tc_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Тест кейс олдсонгүй.")
    for field, value in payload.model_dump().items():
        setattr(tc, field, value)
    await db.commit()
    await db.refresh(tc)
    return tc


@router.post(
    "/{code}/testcases/upload-zip",
    summary="ZIP файлаар бүлээр тест кейс оруулах (Teacher / Admin)",
)
async def upload_testcases_zip(
    code: str,
    file: UploadFile = File(...),
    points_per_case: int = 10,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    ZIP файлын бүтэц дэрэх загвар: input.1, output.1, input.2, output.2, ...
    Эсвэл input-1.txt, output-1.txt гэх хэлбэртэй байж болно.
    Сампл ?sample дугаар тэмдэглэгтэй файлын нэрэнд дугаар байна, жишээ: 1.sample.in
    """
    import zipfile, io, re

    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Зөвхөн ZIP файл оруулах боломжтой.")

    problem = await _get_problem_or_404(code, db)
    from app.services.upload_validation import UploadValidationError, read_upload_bytes

    try:
        content = await read_upload_bytes(file, 64 * 1024 * 1024)
    except UploadValidationError as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
        from app.services.safe_archive import validate_zip

        validate_zip(zf)
    except (zipfile.BadZipFile, ValueError) as exc:
        zf.close() if "zf" in locals() else None
        raise HTTPException(status_code=400, detail=f"Хүчингүй ZIP файл: {exc}")

    names = zf.namelist()
    # Дүгнэлт зохицгүй файлуудыг шүүх
    inp_pat = re.compile(r"^(?:.+/)?(\.?(?:input[-_.]?(\d+)|(?:in\.?(\d+))|(\d+)\.in|(\d+)[-_.]?in|(\d+)\.input))$", re.I)
    out_pat = re.compile(r"^(?:.+/)?(\.?(?:output[-_.]?(\d+)|(?:out\.?(\d+))|(\d+)\.out|(\d+)[-_.]?out|(\d+)\.output|answer[-_.]?(\d+)|(\d+)\.ans))$", re.I)

    inputs: dict[str, str] = {}
    outputs: dict[str, str] = {}
    sample_nums: set[str] = set()

    for name in names:
        base = name.rsplit("/", 1)[-1]
        # sample тэмдэглэг
        is_sample = "sample" in base.lower()
        # дугаар олны авах
        num_match = re.search(r"(\d+)", base)
        if not num_match:
            continue
        num = num_match.group(1)
        low = base.lower()
        if any(k in low for k in ("in", "input")):
            inputs[num] = zf.read(name).decode("utf-8", errors="replace")
            if is_sample:
                sample_nums.add(num)
        elif any(k in low for k in ("out", "output", "ans", "answer")):
            outputs[num] = zf.read(name).decode("utf-8", errors="replace")

    added = 0
    for num in sorted(inputs.keys(), key=lambda x: int(x)):
        if num not in outputs:
            continue
        # Одоо байгаа тест кейсний хамгийн order + 1
        max_order_res = await db.execute(select(func.max(TestCase.order)).where(TestCase.problem_id == problem.id))
        max_order = max_order_res.scalar_one_or_none() or 0
        tc = TestCase(
            problem_id=problem.id,
            input_data=inputs[num],
            output_data=outputs[num],
            points=points_per_case,
            order=max_order + 1,
            is_sample=(num in sample_nums),
        )
        db.add(tc)
        added += 1

    await db.commit()
    return {"message": f"{added} тест кейс амжилттай оруулагдалаа.", "added": added}


# ─── Hint Endpoints ───────────────────────────────────────────────────────────

@router.get(
    "/{code}/hints",
    response_model=List[HintOut],
    summary="3-шатны хинтийн жагсаалт (нэвтэрсэн хэрэглэгч авах боломжтой)",
)
async def list_hints(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    problem = await _get_problem_or_404(code, db)
    return sorted(problem.hints, key=lambda h: h.level)


@router.post(
    "/{code}/hints",
    response_model=HintOut,
    status_code=status.HTTP_201_CREATED,
    summary="Hint нэмэх (Teacher / Admin)",
)
async def add_hint(
    code: str,
    payload: HintCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    problem = await _get_problem_or_404(code, db)
    hint = ProblemHint(problem_id=problem.id, **payload.model_dump())
    db.add(hint)
    await db.commit()
    await db.refresh(hint)
    return hint


@router.delete(
    "/{code}/hints/{hint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hint устгах (Teacher / Admin)",
)
async def delete_hint(
    code: str,
    hint_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ProblemHint).where(ProblemHint.id == hint_id))
    hint = result.scalar_one_or_none()
    if not hint:
        raise HTTPException(status_code=404, detail="Hint олдсонгүй.")
    await db.delete(hint)
    await db.commit()
    return None


@router.put(
    "/{code}/hints/{hint_id}",
    response_model=HintOut,
    summary="Hint засах (Teacher / Admin)",
)
async def update_hint(
    code: str,
    hint_id: int,
    payload: HintCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ProblemHint).where(ProblemHint.id == hint_id))
    hint = result.scalar_one_or_none()
    if not hint:
        raise HTTPException(status_code=404, detail="Hint олдсонгүй.")
    for field, value in payload.model_dump().items():
        setattr(hint, field, value)
    await db.commit()
    await db.refresh(hint)
    return hint


# ─── Stats Endpoint ───────────────────────────────────────────────────────────

@router.get(
    "/{code}/stats",
    summary="Бодлогын статистик (нийт оролдлого, амжилт, хурдны рейтинг)",
)
async def get_problem_stats(code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Problem).where(Problem.code == code))
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    stats = await _submission_stats(problem.id, db)

    # Status breakdown
    status_q = await db.execute(
        select(Submission.status, func.count())
        .where(Submission.problem_id == problem.id)
        .group_by(Submission.status)
    )
    breakdown = {row[0].value: row[1] for row in status_q.fetchall()}

    # Fastest accepted submission
    fastest_q = await db.execute(
        select(Submission.time_ms)
        .where(
            Submission.problem_id == problem.id,
            Submission.status == SubmissionStatus.ACCEPTED,
        )
        .order_by(Submission.time_ms.asc())
        .limit(1)
    )
    fastest = fastest_q.scalar_one_or_none()

    acceptance_rate = (
        round(stats["accepted_count"] / stats["total_submissions"] * 100, 1)
        if stats["total_submissions"] > 0
        else 0
    )

    return {
        "code":             problem.code,
        "title":            problem.title,
        "acceptance_rate":  acceptance_rate,
        "fastest_ac_ms":    fastest,
        "status_breakdown": breakdown,
        **stats,
    }


# ─── PDF Statement Endpoints ──────────────────────────────────────────────────

@router.post(
    "/{code}/statement-pdf",
    summary="Бодлогын өгүүлбэр PDF файлыг MinIO-д байршуулах (Teacher / Admin)"
)
async def upload_statement_pdf(
    code: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    problem = await _get_problem_or_404(code, db)

    # Зөвхөн PDF файл зөвшөөрөх
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Зөвхөн PDF файл оруулах боломжтой.")

    # Файлын хэмжээг хязгаарлах (жишээ нь 10MB)
    max_size = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Файлын хэмжээ 10MB-аас хэтэрч болохгүй.")

    # MinIO руу хуулах
    key = f"pdfs/{code}.pdf"
    # put_object-д file-like stream хэрэгтэй тул BytesIO ашиглана
    import io
    file_stream = io.BytesIO(content)
    
    # MinIO руу upload хийх
    path = await storage_client.upload_file(
        bucket=settings.MINIO_BUCKET_PROBLEMS,
        key=key,
        data=file_stream,
        length=len(content),
        content_type="application/pdf"
    )

    # DB-д хадгалах
    problem.statement_pdf_path = path
    await db.commit()

    return {
        "status": "success",
        "message": f"'{code}' бодлогын PDF өгүүлбэр амжилттай байршлаа.",
        "path": path
    }


@router.get(
    "/{code}/statement-pdf",
    summary="Бодлогын PDF өгүүлбэрийг татах Presigned URL авах"
)
async def get_statement_pdf_url(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    problem = await _get_problem_or_404(code, db)

    url = await storage_client.get_presigned_url(
        bucket=settings.MINIO_BUCKET_PROBLEMS,
        key=key
    )

    if not url:
        raise HTTPException(status_code=500, detail="Татах холбоос үүсгэхэд алдаа гарлаа.")

    return {"url": url}


def parse_simple_yaml(content: str) -> dict:
    """
    YAML parser for DMOJ init.yml parsing using PyYAML.
    """
    import yaml
    try:
        return yaml.safe_load(content) or {}
    except Exception:
        return {}


@router.post("/upload-package", summary="Нэгдсэн бодлогын ZIP багцыг системд оруулах")
async def upload_problem_package(
    code: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """
    Админ эсвэл багш бодлогын нэгдсэн ZIP файлыг оруулах үеийн endpoint.
    ZIP файл нь дотроо public/ болон private/ хавтастай байна.
    """
    import io
    import zipfile
    
    from app.services.upload_validation import UploadValidationError, read_upload_bytes

    try:
        contents = await read_upload_bytes(file, 64 * 1024 * 1024)
    except UploadValidationError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    if not zipfile.is_zipfile(io.BytesIO(contents)):
        raise HTTPException(status_code=400, detail="Илгээсэн файл зөв ZIP архив биш байна.")

    from app.services.safe_archive import open_validated_zip

    try:
        with open_validated_zip(contents):
            pass
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Хүчингүй ZIP багц: {exc}")

    with open_validated_zip(contents) as z:
        namelist = z.namelist()
        
        # Шаардлагатай файлуудыг баталгаажуулах
        public_statement_path = next((f for f in namelist if f.endswith("public/statement.md")), None)
        private_init_path = next((f for f in namelist if f.endswith("private/init.yml")), None)
        
        if not public_statement_path:
            raise HTTPException(status_code=400, detail="Багц дотор public/statement.md олдсонгүй.")
        if not private_init_path:
            raise HTTPException(status_code=400, detail="Багц дотор private/init.yml олдсонгүй.")
            
        # Бодлогын өгүүлбэрийг унших
        statement_md = z.read(public_statement_path).decode("utf-8")
        
        # init.yml унших
        init_yml_content = z.read(private_init_path).decode("utf-8")
        init_cfg = parse_simple_yaml(init_yml_content)
        
        # Тохиргоонуудыг авах
        time_limit = float(init_cfg.get("time_limit", 1.0))
        memory_limit = int(init_cfg.get("memory_limit", 64))
        
        # 1. Нийтийн хандалттай файлуудыг upload-assets рүү хуулах
        for name in namelist:
            if "public/" in name and not name.endswith("/"):
                file_bytes = z.read(name)
                rel_path = name.split("public/", 1)[1]
                key = f"{code}/{rel_path}"
                
                await storage_client.upload_file(
                    bucket=settings.MINIO_BUCKET_PROBLEMS,
                    key=key,
                    data=io.BytesIO(file_bytes),
                    length=len(file_bytes)
                )
                
        # 2. Нууцлагдмал файлыг баглаж oj-private-problems рүү хуулах
        private_zip_buffer = io.BytesIO()
        with zipfile.ZipFile(private_zip_buffer, "w", zipfile.ZIP_DEFLATED) as pz:
            for name in namelist:
                if "private/" in name and not name.endswith("/"):
                    file_bytes = z.read(name)
                    rel_path = name.split("private/", 1)[1]
                    pz.writestr(rel_path, file_bytes)
                    
        private_zip_bytes = private_zip_buffer.getvalue()
        private_key = f"{code}/cases.zip"
        
        await storage_client.upload_file(
            bucket="oj-private-problems",
            key=private_key,
            data=io.BytesIO(private_zip_bytes),
            length=len(private_zip_bytes)
        )
        
        # 3. Өгөгдлийн санд бодлогыг хадгалах / шинэчлэх
        result = await db.execute(select(Problem).where(Problem.code == code))
        problem = result.scalar_one_or_none()
        
        if not problem:
            problem = Problem(
                code=code,
                title=code,
                statement_markdown=statement_md,
                time_limit=time_limit,
                memory_limit=memory_limit,
                testcases_zip_key=f"oj-private-problems/{private_key}",
                created_by_id=current_user.id
            )
            db.add(problem)
        else:
            problem.statement_markdown = statement_md
            problem.time_limit = time_limit
            problem.memory_limit = memory_limit
            problem.testcases_zip_key = f"oj-private-problems/{private_key}"
            
        await db.flush()
        
        # Хуучин тест кейсүүдийг устгах
        await db.execute(
            TestCase.__table__.delete().where(TestCase.problem_id == problem.id)
        )
        
        # Жишээ оролт/гаралт (Sample testcases)-ийг DB-д хадгалах
        testcases_list = init_cfg.get("test_cases", [])
        
        flat_testcases = []
        is_nested = len(testcases_list) > 0 and "cases" in testcases_list[0]
        if is_nested:
            for subtask in testcases_list:
                sub_points = int(subtask.get("points", 10))
                sub_cases = subtask.get("cases", [])
                for tc in sub_cases:
                    tc_points = int(tc.get("points", sub_points))
                    flat_testcases.append({
                        "in": tc.get("in"),
                        "out": tc.get("out"),
                        "points": tc_points,
                        "sample": tc.get("sample", False)
                    })
        else:
            flat_testcases = testcases_list
            
        order_idx = 1
        for tc in flat_testcases:
            is_sample = str(tc.get("is_sample", "false")).lower() == "true" or str(tc.get("sample", "false")).lower() == "true"
            in_file = tc.get("in")
            out_file = tc.get("out")
            points = int(tc.get("points", 10))
            
            input_data = ""
            output_data = ""
            
            if is_sample and in_file and out_file:
                in_path = next((f for f in namelist if f.endswith(f"private/cases/{in_file}") or f.endswith(f"private/{in_file}")), None)
                out_path = next((f for f in namelist if f.endswith(f"private/cases/{out_file}") or f.endswith(f"private/{out_file}")), None)
                if in_path:
                    input_data = z.read(in_path).decode("utf-8")
                if out_path:
                    output_data = z.read(out_path).decode("utf-8")
                    
            db_tc = TestCase(
                problem_id=problem.id,
                input_data=input_data if is_sample else None,
                output_data=output_data if is_sample else None,
                points=points,
                order=order_idx,
                is_sample=is_sample
            )
            db.add(db_tc)
            order_idx += 1
            
        await db.commit()
        
    return {
        "status": "success",
        "message": f"Бодлого '{code}' нэгдсэн багцын дагуу амжилттай үүсэж шинэчлэгдлээ."
    }


@router.get("/{code}/assets/{filename:path}", summary="Бодлогын нийтийн asset/зургийг binary-аар үзэх")
async def serve_problem_asset(
    code: str,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    code = code.upper()
    problem = await _get_problem_or_404(code, db)
    is_privileged = current_user and current_user.role.value in ("teacher", "admin")
    if not problem.is_visible and not is_privileged:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")
        
    key = f"{code}/assets/{filename}"
    
    def _read():
        try:
            response = storage_client.client.get_object(settings.MINIO_BUCKET_PROBLEMS, key)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except Exception:
            raise HTTPException(status_code=404, detail="Asset олдсонгүй.")
            
    try:
        file_bytes = await anyio.to_thread.run_sync(_read)
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        content_type = "application/octet-stream"
        if ext in ("png", "jpg", "jpeg", "gif", "svg", "webp"):
            content_type = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
        elif ext == "pdf":
            content_type = "application/pdf"
            
        return Response(content=file_bytes, media_type=content_type)
    except HTTPException as e:
        raise e
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error serving public asset {key}: {e}")
        raise HTTPException(status_code=404, detail="Asset олдсонгүй.")


@router.post("/{code}/run-samples", summary="Deprecated: жишээ тестийг submission queue ашиглан ажиллуулна")
async def run_samples(
    code: str,
    req: RunSamplesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Unsafe synchronous sample runner хаагдсан. "
            "POST /api/v1/submissions руу is_sample_test=true утгатай илгээнэ үү."
        ),
    )

@router.get("/{code}/export", summary="Бодлогыг зөөврийн ZIP багц болгон экспортлох (Teacher / Admin)")
async def export_problem(
    code: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    code = code.upper()
    problem = await _get_problem_or_404(code, db)
    
    import io, zipfile, json
    from fastapi.responses import StreamingResponse
    
    # 1. Create a zip file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as z:
        prob_meta = {
            "title": problem.title,
            "code": problem.code,
            "time_limit": problem.time_limit,
            "memory_limit": problem.memory_limit,
            "points": problem.points,
            "xp_reward": problem.xp_reward,
            "difficulty": problem.difficulty.value,
            "topic": problem.topic,
            "olympiad_scope": problem.olympiad_scope.value,
            "division": problem.division.value,
            "olympiad_year": problem.olympiad_year,
            "source_citation": problem.source_citation,
            "hints": [
                {
                    "level": h.level,
                    "title": h.title,
                    "hint_text": h.hint_text,
                    "xp_penalty": h.xp_penalty
                }
                for h in problem.hints
            ],
            "test_cases": [
                {
                    "order": tc.order,
                    "points": tc.points,
                    "is_sample": tc.is_sample,
                    "input_file": f"testcases/{tc.order}.in",
                    "output_file": f"testcases/{tc.order}.out"
                }
                for tc in problem.test_cases
            ]
        }
        
        # Write metadata & statement
        z.writestr("problem.json", json.dumps(prob_meta, ensure_ascii=False, indent=2))
        z.writestr("statement.md", problem.statement_markdown or "")
        
        # Write checker.cpp if exists
        from pathlib import Path
        local_dir = Path("/problems") / f"oj-{problem.code}"
        chk_cpp = local_dir / "checker.cpp"
        if chk_cpp.exists():
            z.writestr("checker.cpp", chk_cpp.read_text(encoding="utf-8"))
                
        # Write test cases
        for tc in problem.test_cases:
            z.writestr(f"testcases/{tc.order}.in", tc.input_data or "")
            z.writestr(f"testcases/{tc.order}.out", tc.output_data or "")
            
        # Download assets from S3 and add to zip
        try:
            objects = storage_client.client.list_objects(
                settings.MINIO_BUCKET_PROBLEMS,
                prefix=f"{problem.code}/assets/",
                recursive=True
            )
            for obj in objects:
                response = storage_client.client.get_object(settings.MINIO_BUCKET_PROBLEMS, obj.object_name)
                data = response.read()
                response.close()
                response.release_conn()
                
                rel_name = obj.object_name.replace(f"{problem.code}/assets/", "assets/")
                z.writestr(rel_name, data)
        except Exception:
            pass
            
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=problem_{problem.code}.zip"
        }
    )


def _validate_problem_import_metadata(prob_meta) -> None:
    import re

    from app.services.upload_validation import UploadValidationError, validate_json_tree

    validate_json_tree(prob_meta, max_nodes=20_000, max_depth=30)
    if not isinstance(prob_meta, dict):
        raise UploadValidationError("problem.json must contain a JSON object.")
    code = prob_meta.get("code", "IMPORTED")
    if not isinstance(code, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,30}", code.strip()):
        raise UploadValidationError("Problem code must be 1-30 safe characters.")
    for key, max_bytes in {
        "title": 200,
        "topic": 50,
        "statement_pdf_path": 255,
        "source_citation": 255,
        "statement_markdown": 1024 * 1024,
    }.items():
        value = prob_meta.get(key)
        if value is not None and (
            not isinstance(value, str) or len(value.encode("utf-8")) > max_bytes
        ):
            raise UploadValidationError(f"Invalid or oversized problem.json field: {key}")
    test_cases = prob_meta.get("test_cases", [])
    hints = prob_meta.get("hints", [])
    if not isinstance(test_cases, list) or len(test_cases) > 2_000:
        raise UploadValidationError("problem.json test_cases must have at most 2000 items.")
    if not isinstance(hints, list) or len(hints) > 100:
        raise UploadValidationError("problem.json hints must have at most 100 items.")
    if any(not isinstance(item, dict) for item in [*test_cases, *hints]):
        raise UploadValidationError("problem.json testcase and hint entries must be objects.")


@router.post("/import", response_model=ProblemListItem, summary="Бодлогыг ZIP файлыг уншиж импортлох (давхардсан код таньж suffix нэмэх)")
async def import_problem(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    import io, zipfile, json
    
    from app.services.upload_validation import UploadValidationError, read_upload_bytes

    try:
        contents = await read_upload_bytes(file, 64 * 1024 * 1024)
    except UploadValidationError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    
    try:
        from app.services.safe_archive import open_validated_zip

        with open_validated_zip(contents) as z:
            if "problem.json" not in z.namelist():
                raise HTTPException(status_code=400, detail="ZIP багцад 'problem.json' файл олдсонгүй.")
                
            prob_meta = json.loads(z.read("problem.json").decode("utf-8"))
            _validate_problem_import_metadata(prob_meta)
            
            statement_markdown = ""
            if "statement.md" in z.namelist():
                statement_markdown = z.read("statement.md").decode("utf-8")
            elif "statement_markdown" in prob_meta:
                statement_markdown = prob_meta["statement_markdown"]
            else:
                statement_markdown = "Бодлогын өгүүлбэр байхгүй байна."
                
            # Conflict Resolution
            base_code = prob_meta.get("code", "IMPORTED").strip().upper()
            unique_code = base_code
            counter = 1
            while True:
                existing = await db.execute(select(Problem).where(Problem.code == unique_code))
                if not existing.scalar_one_or_none():
                    break
                unique_code = f"{base_code}_{counter}"
                counter += 1
                
            # Create Problem
            new_problem = Problem(
                code=unique_code,
                title=prob_meta.get("title", f"Импортлогдсон бодлого ({unique_code})"),
                statement_markdown=statement_markdown,
                statement_pdf_path=prob_meta.get("statement_pdf_path"),
                time_limit=float(prob_meta.get("time_limit", 1.0)),
                memory_limit=int(prob_meta.get("memory_limit", 64)),
                points=int(prob_meta.get("points", 10)),
                xp_reward=int(prob_meta.get("xp_reward", 20)),
                difficulty=DifficultyLevel(prob_meta.get("difficulty", "Bronze")),
                topic=prob_meta.get("topic", "Brute Force"),
                olympiad_scope=OlympiadScope(prob_meta.get("olympiad_scope", OlympiadScope.TRAINING.value)),
                division=DivisionCategory(prob_meta.get("division", DivisionCategory.GENERAL.value)),
                olympiad_year=prob_meta.get("olympiad_year"),
                source_citation=prob_meta.get("source_citation"),
                created_by_id=current_user.id
            )
            
            db.add(new_problem)
            await db.flush()
            
            # Upload assets/ to MinIO
            for file_path in z.namelist():
                if file_path.startswith("assets/") and not file_path.endswith("/"):
                    data = z.read(file_path)
                    filename = file_path.replace("assets/", "")
                    dest_key = f"{unique_code}/assets/{filename}"
                    
                    def _upload():
                        import io as pyio
                        storage_client.client.put_object(
                            settings.MINIO_BUCKET_PROBLEMS,
                            dest_key,
                            pyio.BytesIO(data),
                            length=len(data)
                        )
                    await anyio.to_thread.run_sync(_upload)
            
            if unique_code != base_code:
                statement_markdown = statement_markdown.replace(
                    f"/problems/{base_code}/assets/",
                    f"/problems/{unique_code}/assets/"
                )
                new_problem.statement_markdown = statement_markdown
                await db.flush()
                
            # Import checker.cpp if exists
            if "checker.cpp" in z.namelist():
                checker_data = z.read("checker.cpp").decode("utf-8")
                def _write_checker():
                    from pathlib import Path
                    local_dir = Path("/problems") / f"oj-{unique_code}"
                    local_dir.mkdir(parents=True, exist_ok=True)
                    (local_dir / "checker.cpp").write_text(checker_data, encoding="utf-8")
                await anyio.to_thread.run_sync(_write_checker)
                
            # Create test cases
            for tc_meta in prob_meta.get("test_cases", []):
                input_file = tc_meta.get("input_file")
                output_file = tc_meta.get("output_file")
                
                input_data = ""
                output_data = ""
                
                if input_file and input_file in z.namelist():
                    input_data = z.read(input_file).decode("utf-8", errors="replace")
                if output_file and output_file in z.namelist():
                    output_data = z.read(output_file).decode("utf-8", errors="replace")
                    
                new_tc = TestCase(
                    problem_id=new_problem.id,
                    input_data=input_data,
                    output_data=output_data,
                    points=int(tc_meta.get("points", 10)),
                    order=int(tc_meta.get("order", 1)),
                    is_sample=bool(tc_meta.get("is_sample", False))
                )
                db.add(new_tc)
                
            # Create hints
            for hint_meta in prob_meta.get("hints", []):
                new_hint = ProblemHint(
                    problem_id=new_problem.id,
                    level=int(hint_meta.get("level", 1)),
                    title=hint_meta.get("title", ""),
                    hint_text=hint_meta.get("hint_text", ""),
                    xp_penalty=int(hint_meta.get("xp_penalty", 5))
                )
                db.add(new_hint)
                
            await db.commit()
            
            tc_count = len(prob_meta.get("test_cases", []))
            
            return {
                "id": new_problem.id,
                "code": new_problem.code,
                "title": new_problem.title,
                "points": new_problem.points,
                "xp_reward": new_problem.xp_reward,
                "difficulty": new_problem.difficulty,
                "topic": new_problem.topic,
                "time_limit": new_problem.time_limit,
                "memory_limit": new_problem.memory_limit,
                "olympiad_scope": new_problem.olympiad_scope,
                "division": new_problem.division,
                "olympiad_year": new_problem.olympiad_year,
                "source_citation": new_problem.source_citation,
                "is_visible": new_problem.is_visible,
                "testcase_count": tc_count,
                "accepted_count": 0,
                "total_submissions": 0,
                "solved_status": "unsolved"
            }
            
    except HTTPException:
        await db.rollback()
        raise
    except (zipfile.BadZipFile, ValueError, TypeError, KeyError) as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Хүчингүй ZIP файл: {exc}")
    except Exception as e:
        await db.rollback()
        import logging
        logging.getLogger(__name__).error(f"Error importing problem package: {e}")
        raise HTTPException(status_code=500, detail=f"Бодлого импортлоход алдаа гарлаа: {str(e)}")
