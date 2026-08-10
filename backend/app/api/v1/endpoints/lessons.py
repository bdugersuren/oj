"""
Lessons API Endpoints
GET    /api/v1/lessons                        — Жагсаалт (Filter by category/topic)
GET    /api/v1/lessons/{slug}                 — Дэлгэрэнгүй харах
POST   /api/v1/lessons                        — Хичээл үүсгэх (teacher/admin)
PUT    /api/v1/lessons/{slug}                 — Хичээл засах (teacher/admin, зөвхөн өөрийнх)
DELETE /api/v1/lessons/{slug}                 — Хичээл устгах (teacher/admin, зөвхөн өөрийнх)
POST   /api/v1/lessons/{slug}/complete        — Хичээл дуусгах + Quiz шалгах
POST   /api/v1/lessons/{slug}/quizzes         — Quiz нэмэх (teacher/admin)
DELETE /api/v1/lessons/{slug}/quizzes/{id}    — Quiz устгах (teacher/admin)
POST   /api/v1/lessons/{slug}/problems        — Практик бодлого холбох (teacher/admin)
DELETE /api/v1/lessons/{slug}/problems/{id}   — Практик бодлого салгах (teacher/admin)
GET    /api/v1/lessons/admin/all              — Бүх хичээл (нийтлэгдсэн + ноорог) багш/admin
"""
import json
import logging
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.models.lesson import Lesson, LessonQuiz, LessonProblem, UserLessonProgress, LessonCategory
from app.models.classroom import Classroom, ClassroomStudent, ClassroomLesson
from app.models.problem import Problem
from app.models.progression import StudentProgress
from app.services.xp_engine import award_xp

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class QuizOut(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_option_index: Optional[int] = None
    correct_answers_json: Optional[str] = None
    quiz_type: str = "single"
    explanation: str
    order: int

class QuizOutPublic(BaseModel):
    id: int
    question: str
    options: List[str]
    quiz_type: str = "single"
    order: int

class PracticeProblemOut(BaseModel):
    id: int
    code: str
    title: str
    points: int
    xp_reward: int
    difficulty: str
    topic: str
    is_recommended: bool

class LessonListItem(BaseModel):
    id: int
    slug: str
    title: str
    category: str
    topic: str
    difficulty: str
    estimated_minutes: int
    xp_reward: int
    summary: str
    order: int
    is_published: bool
    is_public: bool = True
    practice_problems_count: int
    is_completed: bool = False
    created_by_username: Optional[str] = None
    classroom_ids: List[int] = []

class LessonDetail(BaseModel):
    id: int
    slug: str
    title: str
    category: str
    topic: str
    difficulty: str
    estimated_minutes: int
    xp_reward: int
    summary: str
    content_markdown: str
    order: int
    is_published: bool
    quizzes: List[QuizOutPublic]
    practice_problems: List[PracticeProblemOut]
    is_completed: bool = False
    quiz_score: int = 0
    solved_quizzes: List[int] = []
    created_by_username: Optional[str] = None

class LessonDetailAdmin(LessonDetail):
    """Admin/Teacher view — includes correct_option_index and explanation in quizzes"""
    quizzes: List[QuizOut]

class QuizSubmit(BaseModel):
    answers: List[int]

class QuizSubmitIndividual(BaseModel):
    answer: Union[int, List[int], str]

class QuizCreate(BaseModel):
    question: str
    options: List[str]
    correct_option_index: Optional[int] = None
    correct_answers_json: Optional[str] = None
    quiz_type: str = "single"
    explanation: str
    order: int = 1

class LessonCreate(BaseModel):
    slug: str
    title: str
    category: LessonCategory
    topic: str
    difficulty: str = "Bronze"
    estimated_minutes: int = 15
    xp_reward: int = 25
    summary: str
    content_markdown: str
    order: int = 1
    is_published: bool = True
    is_public: bool = True
    quizzes: List[QuizCreate] = []

class LessonUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[LessonCategory] = None
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    estimated_minutes: Optional[int] = None
    xp_reward: Optional[int] = None
    summary: Optional[str] = None
    content_markdown: Optional[str] = None
    order: Optional[int] = None
    is_published: Optional[bool] = None
    is_public: Optional[bool] = None

class AddProblemPayload(BaseModel):
    problem_code: str
    is_recommended: bool = True
    order: int = 1

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _quiz_to_dict(q: LessonQuiz, include_answers: bool = False) -> dict:
    try:
        opts = json.loads(q.options_json)
    except Exception:
        opts = []
    d = {
        "id": q.id, 
        "question": q.question, 
        "options": opts, 
        "quiz_type": q.quiz_type, 
        "order": q.order
    }
    if include_answers:
        d["correct_option_index"] = q.correct_option_index
        d["correct_answers_json"] = q.correct_answers_json
        d["explanation"] = q.explanation
    return d

def _lesson_to_list_item(l: Lesson, completed_ids: set, include_meta: bool = False) -> dict:
    return {
        "id": l.id,
        "slug": l.slug,
        "title": l.title,
        "category": l.category.value if hasattr(l.category, "value") else str(l.category),
        "topic": l.topic,
        "difficulty": l.difficulty,
        "estimated_minutes": l.estimated_minutes,
        "xp_reward": l.xp_reward,
        "summary": l.summary,
        "order": l.order,
        "is_published": l.is_published,
        "is_public": l.is_public,
        "practice_problems_count": len(l.practice_problems),
        "is_completed": l.id in completed_ids,
        "created_by_username": l.created_by.username if l.created_by else None,
        "classroom_ids": [cl.classroom_id for cl in l.classroom_lessons] if hasattr(l, 'classroom_lessons') and l.classroom_lessons else [],
    }

async def _can_edit_lesson(lesson: Lesson, user: User) -> bool:
    """Багш зөвхөн өөрийн хичээлийг засаж болно; admin бол бүгдийг"""
    if user.role == UserRole.ADMIN:
        return True
    return lesson.created_by_id == user.id

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/admin/all", response_model=List[LessonListItem])
async def list_lessons_admin(
    category: Optional[str] = None,
    topic: Optional[str] = None,
    search: Optional[str] = None,
    classroom_id: Optional[int] = None,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Багш/Admin — өөрийн нийт хичээлүүдийг харах (Хичээлийн Сан)"""
    query = select(Lesson).options(
        selectinload(Lesson.practice_problems),
        selectinload(Lesson.created_by),
        selectinload(Lesson.classroom_lessons),
    )
    # Багш зөвхөн өөрийн үүсгэсэн хичээлүүдийг хардаг (Хичээлийн Сан)
    if current_user.role == UserRole.TEACHER:
        query = query.where(Lesson.created_by_id == current_user.id)
    # classroom_id шүүлт: тухайн ангид холбогдсон хичээлүүд
    if classroom_id is not None:
        query = query.join(
            ClassroomLesson,
            and_(ClassroomLesson.lesson_id == Lesson.id, ClassroomLesson.classroom_id == classroom_id)
        )
    if category and category != "Бүгд":
        query = query.where(Lesson.category == category)
    if topic and topic != "Бүгд":
        query = query.where(Lesson.topic == topic)
    if search:
        query = query.where(Lesson.title.ilike(f"%{search}%"))

    result = await db.execute(query.order_by(Lesson.order))
    lessons = result.scalars().all()
    return [_lesson_to_list_item(l, set(), include_meta=True) for l in lessons]


@router.get("/", response_model=List[LessonListItem])
async def list_lessons(
    category: Optional[str] = None,
    topic: Optional[str] = None,
    classroom_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pattern 3: Нийтийн хичээлүүд + хэрэглэгчийн ангидаа холбогдсон хичээлүүд"""
    query = select(Lesson).options(
        selectinload(Lesson.practice_problems),
        selectinload(Lesson.created_by),
        selectinload(Lesson.classroom_lessons),
    ).where(Lesson.is_published == True)

    # Тухайн ангийн хичээлүүд (classroom_lessons join-р)
    if classroom_id is not None:
        if not current_user:
            raise HTTPException(status_code=401, detail="Нэвтрэх шаардлагатай.")
        
        class_res = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
        classroom = class_res.scalar_one_or_none()
        if not classroom:
            raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
            
        is_teacher_or_admin = (classroom.teacher_id == current_user.id or current_user.role == UserRole.ADMIN)
        if not is_teacher_or_admin:
            member_res = await db.execute(
                select(ClassroomStudent).where(
                    and_(
                        ClassroomStudent.classroom_id == classroom_id,
                        ClassroomStudent.student_id == current_user.id,
                        ClassroomStudent.status == "approved"
                    )
                )
            )
            if not member_res.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Та энэ ангийн батлагдсан сурагч биш байна.")
        
        # classroom_lessons join хийж тухайн ангийн хичээлүүдийг авна
        query = query.join(
            ClassroomLesson,
            and_(
                ClassroomLesson.lesson_id == Lesson.id,
                ClassroomLesson.classroom_id == classroom_id,
                ClassroomLesson.is_published == True
            )
        )
    else:
        # Нийтийн хичээлүүд + хэрэглэгчийн ангидаа холбогдсон хувийн хичээлүүд
        if current_user:
            # Хэрэглэгчийн батлагдсан ангиудын ID-нууд
            my_classes_res = await db.execute(
                select(ClassroomStudent.classroom_id).where(
                    and_(
                        ClassroomStudent.student_id == current_user.id,
                        ClassroomStudent.status == "approved"
                    )
                )
            )
            approved_classroom_ids = [row[0] for row in my_classes_res.fetchall()]
            
            # Багш: өөрийн ангиудын ID нэмэх
            if current_user.role == UserRole.TEACHER:
                my_owned_res = await db.execute(
                    select(Classroom.id).where(Classroom.teacher_id == current_user.id)
                )
                approved_classroom_ids.extend([row[0] for row in my_owned_res.fetchall()])

            if approved_classroom_ids:
                # Нийтийн эсвэл тухайн ангид холбогдсон хувийн хичээлүүд
                linked_lesson_ids_res = await db.execute(
                    select(ClassroomLesson.lesson_id).where(
                        ClassroomLesson.classroom_id.in_(approved_classroom_ids)
                    )
                )
                linked_lesson_ids = [row[0] for row in linked_lesson_ids_res.fetchall()]
                query = query.where(
                    or_(
                        Lesson.is_public == True,
                        Lesson.id.in_(linked_lesson_ids)
                    )
                )
            else:
                query = query.where(Lesson.is_public == True)
        else:
            # Нэвтрээгүй хэрэглэгч: зөвхөн нийтийн
            query = query.where(Lesson.is_public == True)

    if category and category != "Бүгд":
        try:
            query = query.where(Lesson.category == category)
        except Exception:
            pass
    if topic and topic != "Бүгд":
        query = query.where(Lesson.topic == topic)

    result = await db.execute(query.order_by(Lesson.order))
    lessons = result.scalars().all()

    completed_lesson_ids: set = set()
    if current_user:
        prog_res = await db.execute(
            select(UserLessonProgress.lesson_id)
            .where(
                and_(
                    UserLessonProgress.user_id == current_user.id,
                    UserLessonProgress.is_completed == True,
                )
            )
        )
        completed_lesson_ids = {row[0] for row in prog_res.fetchall()}

    return [_lesson_to_list_item(l, completed_lesson_ids) for l in lessons]


@router.get("/{slug}", response_model=LessonDetail)
async def get_lesson_detail(
    slug: str,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    is_teacher = current_user and current_user.role in (UserRole.TEACHER, UserRole.ADMIN)
    cond = Lesson.slug == slug
    if not is_teacher:
        cond = and_(cond, Lesson.is_published == True)

    result = await db.execute(
        select(Lesson)
        .options(
            selectinload(Lesson.quizzes),
            selectinload(Lesson.practice_problems).selectinload(LessonProblem.problem),
            selectinload(Lesson.created_by),
            selectinload(Lesson.classroom_lessons),
        )
        .where(cond)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Онолын хичээл олдсонгүй.")

    # Хувийн хичээл байвал (is_public=False): хэрэглэгч холбогдсон ангийн гишүүн эсэхийг шалгана
    if not lesson.is_public:
        if not current_user:
            raise HTTPException(status_code=401, detail="Нэвтрэх шаардлагатай.")
        
        is_teacher_or_admin = current_user.role in (UserRole.TEACHER, UserRole.ADMIN)
        # Багш бол өөрийн үүсгэсэн хичээл уу шалгана
        if is_teacher_or_admin and lesson.created_by_id == current_user.id:
            pass  # Зөвшөөрсөн
        elif current_user.role == UserRole.ADMIN:
            pass  # Admin бол бүгд
        else:
            # Хичээлтэй холбогдсон ангиудын ID авах
            cl_res = await db.execute(
                select(ClassroomLesson.classroom_id).where(ClassroomLesson.lesson_id == lesson.id)
            )
            lesson_classroom_ids = [row[0] for row in cl_res.fetchall()]
            
            if not lesson_classroom_ids:
                raise HTTPException(status_code=403, detail="Та энэ хичээлийг үзэх эрхгүй.")
            
            # Сурагч тухайн ангиудын аль нэгэнд нь батлагдсан гишүүн мөн эсэх
            member_res = await db.execute(
                select(ClassroomStudent).where(
                    and_(
                        ClassroomStudent.classroom_id.in_(lesson_classroom_ids),
                        ClassroomStudent.student_id == current_user.id,
                        ClassroomStudent.status == "approved"
                    )
                )
            )
            if not member_res.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Та энэ хичээлтэй холбогдсон ангийн батлагдсан сурагч биш тул хичээлийг үзэх эрхгүй.")

    is_completed = False
    quiz_score = 0
    solved_quizzes = []
    if current_user:
        prog_res = await db.execute(
            select(UserLessonProgress).where(
                UserLessonProgress.user_id == current_user.id,
                UserLessonProgress.lesson_id == lesson.id,
            )
        )
        progress = prog_res.scalar_one_or_none()
        if progress:
            is_completed = progress.is_completed
            quiz_score = progress.quiz_score
            try:
                solved_quizzes = json.loads(progress.solved_quizzes_json)
            except Exception:
                solved_quizzes = []

    include_answers = is_teacher
    quizzes_out = [_quiz_to_dict(q, include_answers=include_answers) for q in lesson.quizzes]

    problems_out = []
    for lp in lesson.practice_problems:
        if lp.problem:
            problems_out.append({
                "id": lp.problem.id,
                "code": lp.problem.code,
                "title": lp.problem.title,
                "points": lp.problem.points,
                "xp_reward": lp.problem.xp_reward,
                "difficulty": lp.problem.difficulty.value if hasattr(lp.problem.difficulty, "value") else str(lp.problem.difficulty),
                "topic": lp.problem.topic,
                "is_recommended": lp.is_recommended,
            })

    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "title": lesson.title,
        "category": lesson.category.value if hasattr(lesson.category, "value") else str(lesson.category),
        "topic": lesson.topic,
        "difficulty": lesson.difficulty,
        "estimated_minutes": lesson.estimated_minutes,
        "xp_reward": lesson.xp_reward,
        "summary": lesson.summary,
        "content_markdown": lesson.content_markdown,
        "order": lesson.order,
        "is_published": lesson.is_published,
        "is_public": lesson.is_public,
        "quizzes": quizzes_out,
        "practice_problems": problems_out,
        "is_completed": is_completed,
        "quiz_score": quiz_score,
        "solved_quizzes": solved_quizzes,
        "created_by_username": lesson.created_by.username if lesson.created_by else None,
        "classroom_ids": [cl.classroom_id for cl in lesson.classroom_lessons] if hasattr(lesson, 'classroom_lessons') and lesson.classroom_lessons else [],
    }


@router.post("/", response_model=LessonDetail, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    payload: LessonCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    slug_exist = await db.execute(select(Lesson).where(Lesson.slug == payload.slug))
    if slug_exist.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Давхцсан slug байна. Өөр slug сонгоно уу.")

    lesson = Lesson(
        slug=payload.slug,
        title=payload.title,
        category=payload.category,
        topic=payload.topic,
        difficulty=payload.difficulty,
        estimated_minutes=payload.estimated_minutes,
        xp_reward=payload.xp_reward,
        summary=payload.summary,
        content_markdown=payload.content_markdown,
        order=payload.order,
        is_published=payload.is_published,
        is_public=payload.is_public,
        created_by_id=current_user.id,
    )
    db.add(lesson)
    await db.flush()

    for idx, q in enumerate(payload.quizzes):
        quiz = LessonQuiz(
            lesson_id=lesson.id,
            question=q.question,
            options_json=json.dumps(q.options, ensure_ascii=False),
            correct_option_index=q.correct_option_index,
            explanation=q.explanation,
            order=q.order or (idx + 1),
        )
        db.add(quiz)

    await db.commit()
    return await get_lesson_detail(lesson.slug, current_user, db)


@router.put("/{slug}", response_model=LessonDetail)
async def update_lesson(
    slug: str,
    payload: LessonUpdate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson).options(selectinload(Lesson.created_by)).where(Lesson.slug == slug)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
    if not await _can_edit_lesson(lesson, current_user):
        raise HTTPException(status_code=403, detail="Та зөвхөн өөрийн үүсгэсэн хичээлийг засах боломжтой.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)

    await db.commit()
    return await get_lesson_detail(lesson.slug, current_user, db)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    slug: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson).options(selectinload(Lesson.created_by)).where(Lesson.slug == slug)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
    if not await _can_edit_lesson(lesson, current_user):
        raise HTTPException(status_code=403, detail="Та зөвхөн өөрийн үүсгэсэн хичээлийг устгах боломжтой.")

    await db.delete(lesson)
    await db.commit()


@router.post("/{slug}/quizzes", status_code=status.HTTP_201_CREATED)
async def add_quiz(
    slug: str,
    payload: QuizCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.slug == slug))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
    if not await _can_edit_lesson(lesson, current_user):
        raise HTTPException(status_code=403, detail="Эрхгүй.")

    quiz = LessonQuiz(
        lesson_id=lesson.id,
        question=payload.question,
        options_json=json.dumps(payload.options, ensure_ascii=False),
        correct_option_index=payload.correct_option_index,
        correct_answers_json=payload.correct_answers_json,
        quiz_type=payload.quiz_type,
        explanation=payload.explanation,
        order=payload.order,
    )
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    return _quiz_to_dict(quiz, include_answers=True)


@router.delete("/{slug}/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(
    slug: str,
    quiz_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.slug == slug))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
    if not await _can_edit_lesson(lesson, current_user):
        raise HTTPException(status_code=403, detail="Эрхгүй.")

    q_res = await db.execute(
        select(LessonQuiz).where(LessonQuiz.id == quiz_id, LessonQuiz.lesson_id == lesson.id)
    )
    quiz = q_res.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz олдсонгүй.")
    await db.delete(quiz)
    await db.commit()


@router.post("/{slug}/problems", status_code=status.HTTP_201_CREATED)
async def add_practice_problem(
    slug: str,
    payload: AddProblemPayload,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.slug == slug))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
    if not await _can_edit_lesson(lesson, current_user):
        raise HTTPException(status_code=403, detail="Эрхгүй.")

    prob_res = await db.execute(select(Problem).where(Problem.code == payload.problem_code))
    problem = prob_res.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail=f"'{payload.problem_code}' кодтой бодлого олдсонгүй.")

    # Давхардал шалгах
    exist = await db.execute(
        select(LessonProblem).where(
            LessonProblem.lesson_id == lesson.id,
            LessonProblem.problem_id == problem.id,
        )
    )
    if exist.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Энэ бодлого аль хэдийн холбогдсон байна.")

    lp = LessonProblem(
        lesson_id=lesson.id,
        problem_id=problem.id,
        is_recommended=payload.is_recommended,
        order=payload.order,
    )
    db.add(lp)
    await db.commit()
    return {"message": f"'{problem.title}' бодлогыг хичээлтэй холбов.", "problem_id": problem.id}


@router.delete("/{slug}/problems/{lp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_practice_problem(
    slug: str,
    lp_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.slug == slug))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
    if not await _can_edit_lesson(lesson, current_user):
        raise HTTPException(status_code=403, detail="Эрхгүй.")

    lp_res = await db.execute(
        select(LessonProblem).where(
            LessonProblem.id == lp_id,
            LessonProblem.lesson_id == lesson.id,
        )
    )
    lp = lp_res.scalar_one_or_none()
    if not lp:
        raise HTTPException(status_code=404, detail="Холбоос олдсонгүй.")
    await db.delete(lp)
    await db.commit()


@router.post("/{slug}/complete")
async def complete_lesson(
    slug: str,
    payload: QuizSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson).options(selectinload(Lesson.quizzes)).where(Lesson.slug == slug)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")

    correct_count = 0
    total_quizzes = len(lesson.quizzes)
    if total_quizzes > 0:
        for idx, q in enumerate(lesson.quizzes):
            if idx < len(payload.answers) and payload.answers[idx] == q.correct_option_index:
                correct_count += 1
        score_percentage = int((correct_count / total_quizzes) * 100)
    else:
        score_percentage = 100

    prog_res = await db.execute(
        select(UserLessonProgress).where(
            UserLessonProgress.user_id == current_user.id,
            UserLessonProgress.lesson_id == lesson.id,
        )
    )
    progress = prog_res.scalar_one_or_none()
    xp_to_award = 0
    if not progress:
        progress = UserLessonProgress(
            user_id=current_user.id,
            lesson_id=lesson.id,
            is_completed=True,
            quiz_score=score_percentage,
        )
        db.add(progress)
        xp_to_award = lesson.xp_reward
    else:
        if not progress.is_completed:
            progress.is_completed = True
            xp_to_award = lesson.xp_reward
        if score_percentage > progress.quiz_score:
            progress.quiz_score = score_percentage

    await db.commit()
    if xp_to_award > 0:
        await award_xp(db, current_user.id, xp_to_award, f"Онолын хичээл үзэж дуусгасан: {lesson.title}")

    return {
        "success": True,
        "correct_count": correct_count,
        "total_quizzes": total_quizzes,
        "xp_earned": xp_to_award,
        "message": f"🎉 Баяр хүргэе! Онолын хичээлийг амжилттай дуусгаж +{xp_to_award} XP авлаа."
        if xp_to_award > 0
        else "Хичээлийн агуулгыг дахин шалгаж дуусгалаа.",
    }


@router.post("/{slug}/quizzes/{quiz_id}/submit")
async def submit_quiz_individual(
    slug: str,
    quiz_id: int,
    payload: QuizSubmitIndividual,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Lesson).where(Lesson.slug == slug))
    lesson = res.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")
        
    quiz_res = await db.execute(
        select(LessonQuiz).where(LessonQuiz.id == quiz_id, LessonQuiz.lesson_id == lesson.id)
    )
    quiz = quiz_res.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Тест олдсонгүй.")

    is_correct = False
    
    if quiz.quiz_type == "single":
        if isinstance(payload.answer, int):
            correct_idx = quiz.correct_option_index
            if correct_idx is None and quiz.correct_answers_json:
                try:
                    c_answers = json.loads(quiz.correct_answers_json)
                    if isinstance(c_answers, list) and len(c_answers) > 0:
                        correct_idx = int(c_answers[0])
                except Exception:
                    pass
            is_correct = (payload.answer == correct_idx)
            
    elif quiz.quiz_type == "multiple":
        if isinstance(payload.answer, list):
            try:
                c_answers = json.loads(quiz.correct_answers_json or "[]")
                user_set = set(int(x) for x in payload.answer)
                correct_set = set(int(x) for x in c_answers)
                is_correct = (user_set == correct_set)
            except Exception:
                is_correct = False
                
    elif quiz.quiz_type == "text":
        if isinstance(payload.answer, (str, int)):
            try:
                c_answers = json.loads(quiz.correct_answers_json or "[]")
                if not isinstance(c_answers, list):
                    c_answers = [str(c_answers)]
                user_str = str(payload.answer).strip().lower()
                correct_strs = [str(x).strip().lower() for x in c_answers]
                is_correct = (user_str in correct_strs)
            except Exception:
                is_correct = False

    if not is_correct:
        return {"success": False, "message": "Хариулт буруу байна. Дахин оролдоно уу."}

    prog_res = await db.execute(
        select(UserLessonProgress).where(
            UserLessonProgress.user_id == current_user.id,
            UserLessonProgress.lesson_id == lesson.id,
        )
    )
    progress = prog_res.scalar_one_or_none()
    
    solved_quizzes = []
    if progress:
        try:
            solved_quizzes = json.loads(progress.solved_quizzes_json)
        except Exception:
            solved_quizzes = []
    
    if quiz_id not in solved_quizzes:
        solved_quizzes.append(quiz_id)
        
    quizzes_res = await db.execute(
        select(LessonQuiz).where(LessonQuiz.lesson_id == lesson.id)
    )
    all_quizzes = quizzes_res.scalars().all()
    all_quiz_ids = [q.id for q in all_quizzes]
    
    solved_count = sum(1 for q_id in all_quiz_ids if q_id in solved_quizzes)
    score_percentage = int((solved_count / len(all_quiz_ids)) * 100) if all_quiz_ids else 100
    
    is_completed_now = all(q_id in solved_quizzes for q_id in all_quiz_ids)
    
    xp_awarded = 0
    if not progress:
        progress = UserLessonProgress(
            user_id=current_user.id,
            lesson_id=lesson.id,
            is_completed=is_completed_now,
            quiz_score=score_percentage,
            solved_quizzes_json=json.dumps(solved_quizzes),
        )
        db.add(progress)
        if is_completed_now:
            xp_awarded = lesson.xp_reward
            await award_xp(db, current_user.id, lesson.xp_reward, f"'{lesson.title}' хичээлийг дуусгав")
    else:
        progress.solved_quizzes_json = json.dumps(solved_quizzes)
        progress.quiz_score = score_percentage
        if is_completed_now and not progress.is_completed:
            progress.is_completed = True
            xp_awarded = lesson.xp_reward
            await award_xp(db, current_user.id, lesson.xp_reward, f"'{lesson.title}' хичээлийг дуусгав")
            
    await db.commit()
    
    msg = "Зөв хариуллаа, баяр хүргэе!"
    if is_completed_now and xp_awarded > 0:
        msg = f"Зөв хариуллаа, баяр хүргэе! Та хичээлийг дуусгаж +{xp_awarded} XP авлаа."
        
    return {"success": True, "message": msg, "solved_quizzes": solved_quizzes, "is_completed": is_completed_now}
