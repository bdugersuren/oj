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
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, field_validator

from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_user, require_role
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

    model_config = {"from_attributes": True}


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
):
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

    items = []
    for p in problems:
        stats = await _submission_stats(p.id, db)
        # Count testcases via separate query (avoid N+1 with selectinload on list)
        tc_count = await db.execute(
            select(func.count()).where(TestCase.problem_id == p.id)
        )
        items.append({
            **p.__dict__,
            "testcase_count":   tc_count.scalar_one() or 0,
            **stats,
        })
    return items


@router.get(
    "/{code}",
    response_model=ProblemDetail,
    summary="Бодлогын дэлгэрэнгүй мэдээлэл + Sample Testcase + Hints",
)
async def get_problem(code: str, db: AsyncSession = Depends(get_db)):
    problem = await _get_problem_or_404(code, db)
    if not problem.is_visible:
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
    content = await file.read()

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Дотоодгүй ZIP файл.")

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

    if not problem.statement_pdf_path:
        raise HTTPException(status_code=404, detail="Энэ бодлогод PDF өгүүлбэр байхгүй байна.")

    # MinIO key нь '/oj-problems/pdfs/BF101.pdf' хэлбэртэй ирнэ, бидэнд 'pdfs/BF101.pdf' хэрэгтэй.
    key = problem.statement_pdf_path.replace(f"/{settings.MINIO_BUCKET_PROBLEMS}/", "")

    url = await storage_client.get_presigned_url(
        bucket=settings.MINIO_BUCKET_PROBLEMS,
        key=key
    )

    if not url:
        raise HTTPException(status_code=500, detail="Татах холбоос үүсгэхэд алдаа гарлаа.")

    return {"url": url}

