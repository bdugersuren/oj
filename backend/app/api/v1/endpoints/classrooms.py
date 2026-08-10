import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.classroom import Classroom, ClassroomStudent, ClassroomLesson
from app.models.lesson import Lesson, UserLessonProgress
from app.models.progression import StudentProgress, TopicMastery, StudentLevel
from app.models.submission import Submission, SubmissionStatus
from app.models.problem import Problem
from app.api.v1.endpoints.lessons import LessonListItem, _lesson_to_list_item

router = APIRouter()

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class ClassroomLessonUpdate(BaseModel):
    order: Optional[int] = None
    is_published: Optional[bool] = None

class ClassroomCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class StudentProgressItem(BaseModel):
    student_id: str
    username: str
    full_name: Optional[str]
    email: str
    level: str
    level_color: str
    total_xp: int
    solved_count: int
    current_streak: int
    highest_streak: int
    elo_rating: int
    joined_at: datetime

class ClassroomDetailOut(BaseModel):
    id: int
    teacher_id: str
    name: str
    description: Optional[str]
    invite_code: str
    is_active: bool
    created_at: datetime
    students_count: int
    students: List[StudentProgressItem] = []
    pending_requests: List[StudentProgressItem] = []

class ClassroomListItem(BaseModel):
    id: int
    name: str
    description: Optional[str]
    invite_code: str
    is_active: bool
    created_at: datetime
    teacher_name: str
    students_count: int
    membership_status: Optional[str] = None

class JoinClassroomPayload(BaseModel):
    invite_code: str

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=ClassroomDetailOut, status_code=status.HTTP_201_CREATED)
async def create_classroom(
    payload: ClassroomCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    # Өвөрмөц урилгын код үүсгэх
    invite_code = uuid.uuid4().hex[:8].upper()
    
    # Давхардахгүй байх баталгаа
    while True:
        check = await db.execute(select(Classroom).where(Classroom.invite_code == invite_code))
        if not check.scalar_one_or_none():
            break
        invite_code = uuid.uuid4().hex[:8].upper()

    classroom = Classroom(
        teacher_id=current_user.id,
        name=payload.name,
        description=payload.description,
        invite_code=invite_code,
        is_active=True
    )
    db.add(classroom)
    await db.commit()
    await db.refresh(classroom)

    return {
        "id": classroom.id,
        "teacher_id": str(classroom.teacher_id),
        "name": classroom.name,
        "description": classroom.description,
        "invite_code": classroom.invite_code,
        "is_active": classroom.is_active,
        "created_at": classroom.created_at,
        "students_count": 0,
        "students": [],
        "pending_requests": []
    }

@router.get("/", response_model=List[ClassroomListItem])
async def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.value in ("teacher", "admin"):
        # Багшийн үүсгэсэн ангиуд
        query = select(Classroom).where(Classroom.teacher_id == current_user.id)
        query = query.options(selectinload(Classroom.teacher), selectinload(Classroom.students))
        result = await db.execute(query)
        classrooms = result.scalars().all()
        out = []
        for c in classrooms:
            out.append({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "invite_code": c.invite_code,
                "is_active": c.is_active,
                "created_at": c.created_at,
                "teacher_name": c.teacher.full_name or c.teacher.username if c.teacher else "Багш",
                "students_count": sum(1 for s in c.students if s.status == "approved"),
                "membership_status": "approved"
            })
        return out
    else:
        # Сурагчийн элссэн эсвэл хүсэлт өгсөн ангиуд
        stmt = (
            select(Classroom, ClassroomStudent.status)
            .join(ClassroomStudent, ClassroomStudent.classroom_id == Classroom.id)
            .where(ClassroomStudent.student_id == current_user.id)
            .options(selectinload(Classroom.teacher), selectinload(Classroom.students))
        )
        result = await db.execute(stmt)
        rows = result.all()
        
        out = []
        for row in rows:
            c, status = row
            out.append({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "invite_code": c.invite_code,
                "is_active": c.is_active,
                "created_at": c.created_at,
                "teacher_name": c.teacher.full_name or c.teacher.username if c.teacher else "Багш",
                "students_count": sum(1 for s in c.students if s.status == "approved"),
                "membership_status": status
            })
        return out

@router.get("/{classroom_id}", response_model=ClassroomDetailOut)
async def get_classroom(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Classroom)
        .options(selectinload(Classroom.students).selectinload(ClassroomStudent.student))
        .where(Classroom.id == classroom_id)
    )
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    # Зөвхөн ангийн багш, админ эсвэл тухайн ангийн сурагч нэвтэрч үзнэ
    is_member = any(s.student_id == current_user.id for s in classroom.students)
    is_teacher_or_admin = (classroom.teacher_id == current_user.id or current_user.role.value == "admin")
    
    if not is_teacher_or_admin and not is_member:
        raise HTTPException(status_code=403, detail="Харах эрхгүй байна.")

    # Сурагчдын прогресс датаг цуглуулах
    students_progress = []
    pending_requests = []
    
    for cs in classroom.students:
        s = cs.student
        
        # Хэрэв сурагч хандаж байгаа бол бусад сурагчийн мэдээллийг нуух
        if not is_teacher_or_admin and s.id != current_user.id:
            continue
            
        # Student progress авах
        sp_res = await db.execute(
            select(StudentProgress)
            .options(selectinload(StudentProgress.level))
            .where(StudentProgress.user_id == s.id)
        )
        sp = sp_res.scalar_one_or_none()
        
        level_name = sp.level.name if sp and sp.level else "Bronze"
        level_color = sp.level.color if sp and sp.level else "#cd7f32"
        total_xp = sp.total_xp if sp else 0
        solved_count = sp.solved_count if sp else 0
        current_streak = sp.current_streak if sp else 0
        highest_streak = sp.highest_streak if sp else 0
        elo_rating = sp.elo_rating if sp else 1200

        item = {
            "student_id": str(s.id),
            "username": s.username,
            "full_name": s.full_name,
            "email": s.email,
            "level": level_name,
            "level_color": level_color,
            "total_xp": total_xp,
            "solved_count": solved_count,
            "current_streak": current_streak,
            "highest_streak": highest_streak,
            "elo_rating": elo_rating,
            "joined_at": cs.joined_at
        }

        if cs.status == "approved":
            students_progress.append(item)
        elif cs.status == "pending" and is_teacher_or_admin:
            pending_requests.append(item)

    # XP-ээр нь эрэмбэлэх
    students_progress.sort(key=lambda x: x["total_xp"], reverse=True)
    
    approved_count = sum(1 for s in classroom.students if s.status == "approved")

    return {
        "id": classroom.id,
        "teacher_id": str(classroom.teacher_id),
        "name": classroom.name,
        "description": classroom.description,
        "invite_code": classroom.invite_code,
        "is_active": classroom.is_active,
        "created_at": classroom.created_at,
        "students_count": approved_count,
        "students": students_progress,
        "pending_requests": pending_requests
    }

@router.post("/join")
async def join_classroom(
    payload: JoinClassroomPayload,
    current_user: User = Depends(require_role("student", "teacher")),
    db: AsyncSession = Depends(get_db)
):
    # Кодоор анги хайх
    result = await db.execute(
        select(Classroom).where(Classroom.invite_code == payload.invite_code.strip().upper())
    )
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Буруу урилгын код байна.")
    
    if not classroom.is_active:
        raise HTTPException(status_code=400, detail="Энэ анги идэвхгүй байна.")

    # Өмнө нь элссэн эсвэл хүсэлт илгээсэн эсэхийг шалгах
    check = await db.execute(
        select(ClassroomStudent).where(
            and_(
                ClassroomStudent.classroom_id == classroom.id,
                ClassroomStudent.student_id == current_user.id
            )
        )
    )
    cs = check.scalar_one_or_none()
    if cs:
        if cs.status == "approved":
            raise HTTPException(status_code=400, detail="Та энэ ангид аль хэдийн элссэн байна.")
        elif cs.status == "pending":
            raise HTTPException(status_code=400, detail="Таны ангид элсэх хүсэлт илгээгдсэн, хүлээгдэж байна.")
        elif cs.status == "rejected":
            # Хэрэв татгалзсан бол дахин хүсэлт илгээх боломжтой
            cs.status = "pending"
            cs.joined_at = datetime.utcnow()
            await db.commit()
            return {"status": "success", "message": f"'{classroom.name}' ангид элсэх хүсэлтийг дахин илгээлээ."}
    else:
        cs = ClassroomStudent(
            classroom_id=classroom.id,
            student_id=current_user.id,
            status="pending"
        )
        db.add(cs)
        await db.commit()

    return {"status": "success", "message": f"'{classroom.name}' ангид элсэх хүсэлт илгээлээ. Багшийн зөвшөөрлийг хүлээнэ үү."}

@router.delete("/{classroom_id}/students/{student_id}")
async def remove_student(
    classroom_id: int,
    student_id: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Classroom).where(Classroom.id == classroom_id)
    )
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн багш сурагчийг хасах эрхтэй.")

    student_uuid = uuid.UUID(student_id)
    cs_res = await db.execute(
        select(ClassroomStudent).where(
            and_(
                ClassroomStudent.classroom_id == classroom_id,
                ClassroomStudent.student_id == student_uuid
            )
        )
    )
    cs = cs_res.scalar_one_or_none()
    if not cs:
        raise HTTPException(status_code=404, detail="Сурагч энэ ангид элсээгүй байна.")

    await db.delete(cs)
    await db.commit()

    return {"status": "success", "message": "Сурагчийг ангиас хаслаа."}


@router.post("/{classroom_id}/approve/{student_id}")
async def approve_student(
    classroom_id: int,
    student_id: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Classroom).where(Classroom.id == classroom_id)
    )
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш батлах эрхтэй.")

    student_uuid = uuid.UUID(student_id)
    cs_res = await db.execute(
        select(ClassroomStudent).where(
            and_(
                ClassroomStudent.classroom_id == classroom_id,
                ClassroomStudent.student_id == student_uuid
            )
        )
    )
    cs = cs_res.scalar_one_or_none()
    if not cs:
        raise HTTPException(status_code=404, detail="Хүсэлт олдсонгүй.")

    cs.status = "approved"
    cs.joined_at = datetime.utcnow()
    await db.commit()

    return {"status": "success", "message": "Сурагчийн элсэх хүсэлтийг зөвшөөрлөө."}


@router.post("/{classroom_id}/reject/{student_id}")
async def reject_student(
    classroom_id: int,
    student_id: str,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Classroom).where(Classroom.id == classroom_id)
    )
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш татгалзах эрхтэй.")

    student_uuid = uuid.UUID(student_id)
    cs_res = await db.execute(
        select(ClassroomStudent).where(
            and_(
                ClassroomStudent.classroom_id == classroom_id,
                ClassroomStudent.student_id == student_uuid
            )
        )
    )
    cs = cs_res.scalar_one_or_none()
    if not cs:
        raise HTTPException(status_code=404, detail="Хүсэлт олдсонгүй.")

    cs.status = "rejected"
    await db.commit()

    return {"status": "success", "message": "Сурагчийн элсэх хүсэлтээс татгалзлаа."}

@router.put("/{classroom_id}", response_model=ClassroomDetailOut)
async def update_classroom(
    classroom_id: int,
    payload: ClassroomUpdate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    classroom = await db.get(Classroom, classroom_id)
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
        
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн багш засварлах эрхтэй.")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(classroom, k, v)
        
    await db.commit()
    await db.refresh(classroom)

    return await get_classroom(classroom_id, current_user, db)

@router.delete("/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_classroom(
    classroom_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    classroom = await db.get(Classroom, classroom_id)
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
        
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн багш устгах эрхтэй.")

    await db.delete(classroom)
    await db.commit()
    return None

# ─── Classroom Analytics (Heatmap & Topic Mastery) ───────────────────────────

@router.get("/{classroom_id}/analytics/topic-heatmap")
async def get_classroom_topic_heatmap(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Шалгах: Хэрэглэгч тухайн ангид хамааралтай эсэх
    c_res = await db.execute(
        select(Classroom).options(selectinload(Classroom.students)).where(Classroom.id == classroom_id)
    )
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    is_student_in_class = any(s.student_id == current_user.id for s in classroom.students)
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin" and not is_student_in_class:
        raise HTTPException(status_code=403, detail="Харах эрхгүй байна.")

    # Ангийн сурагчдын ID-нуудыг авах
    student_ids = [s.student_id for s in classroom.students]
    if not student_ids:
        return {}

    # Сурагчдын амжилтгүй (TLE, WA, MLE, RTE) илгээлтүүдийг сэдэв бүрээр тоолох
    # Submissions ба Problems хүснэгтийг join хийх
    query = (
        select(Problem.topic, func.count(Submission.id).label("failures"))
        .join(Submission, Submission.problem_id == Problem.id)
        .where(
            and_(
                Submission.user_id.in_(student_ids),
                Submission.status.in_([
                    SubmissionStatus.WRONG_ANSWER,
                    SubmissionStatus.TIME_LIMIT,
                    SubmissionStatus.MEMORY_LIMIT,
                    SubmissionStatus.RUNTIME_ERROR
                ])
            )
        )
        .group_by(Problem.topic)
    )
    result = await db.execute(query)
    rows = result.all()
    
    # Heatmap формат: {"Brute Force": 12, "Binary Search": 5}
    heatmap = {row[0]: row[1] for row in rows}
    return heatmap

@router.get("/{classroom_id}/analytics/topic-mastery")
async def get_classroom_topic_mastery(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    c_res = await db.execute(
        select(Classroom).options(selectinload(Classroom.students)).where(Classroom.id == classroom_id)
    )
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    is_student_in_class = any(s.student_id == current_user.id for s in classroom.students)
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin" and not is_student_in_class:
        raise HTTPException(status_code=403, detail="Харах эрхгүй байна.")

    student_ids = [s.student_id for s in classroom.students]
    if not student_ids:
        return []

    # Сурагчдын TopicMastery-ийг сэдвээр нь бүлэглэж дундаж эзэмшилтийг олох
    query = (
        select(
            TopicMastery.topic_slug,
            func.avg(TopicMastery.mastery_percentage).label("avg_mastery"),
            func.sum(TopicMastery.solved_count).label("total_solved"),
            func.sum(TopicMastery.attempted_count).label("total_attempted")
        )
        .join(StudentProgress, StudentProgress.id == TopicMastery.progress_id)
        .where(StudentProgress.user_id.in_(student_ids))
        .group_by(TopicMastery.topic_slug)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "topic": row[0],
            "average_mastery": round(float(row[1]), 2) if row[1] is not None else 0.0,
            "total_solved": int(row[2]) if row[2] is not None else 0,
            "total_attempted": int(row[3]) if row[3] is not None else 0
        }
        for row in rows
    ]


@router.get("/{classroom_id}/progress-matrix")
async def get_classroom_progress_matrix(
    classroom_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    c_res = await db.execute(
        select(Classroom).options(selectinload(Classroom.students).selectinload(ClassroomStudent.student)).where(Classroom.id == classroom_id)
    )
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш болон админ сурагчдын ахицыг хянах эрхтэй.")

    # 1. Fetch lessons linked to this classroom
    l_res = await db.execute(
        select(Lesson)
        .join(ClassroomLesson, ClassroomLesson.lesson_id == Lesson.id)
        .where(ClassroomLesson.classroom_id == classroom_id)
        .order_by(ClassroomLesson.order)
    )
    lessons = l_res.scalars().all()

    # 2. Get approved students
    approved_students = [s.student for s in classroom.students if s.status == "approved"]
    
    if not approved_students or not lessons:
        return {
            "lessons": [{"id": l.id, "title": l.title, "order": l.order} for l in lessons],
            "students": []
        }

    student_ids = [s.id for s in approved_students]
    lesson_ids = [l.id for l in lessons]

    # 3. Fetch progress records
    p_res = await db.execute(
        select(UserLessonProgress).where(
            and_(
                UserLessonProgress.user_id.in_(student_ids),
                UserLessonProgress.lesson_id.in_(lesson_ids)
            )
        )
    )
    progress_records = p_res.scalars().all()

    # Map progress
    progress_map = {}
    for p in progress_records:
        progress_map[(p.user_id, p.lesson_id)] = {
            "is_completed": p.is_completed,
            "quiz_score": p.quiz_score
        }

    # 4. Construct matrix response
    students_data = []
    for s in approved_students:
        s_lessons = {}
        for l in lessons:
            prog = progress_map.get((s.id, l.id))
            s_lessons[l.id] = {
                "is_completed": prog["is_completed"] if prog else False,
                "quiz_score": prog["quiz_score"] if prog else 0
            }
        students_data.append({
            "student_id": str(s.id),
            "username": s.username,
            "full_name": s.full_name or s.username,
            "lesson_progress": s_lessons
        })

    return {
        "lessons": [{"id": l.id, "title": l.title, "order": l.order} for l in lessons],
        "students": students_data
    }


@router.get("/{id}/export-report", summary="Ангийн сурагчдын прогресс тайланг CSV хэлбэрээр экспортлох (Teacher / Admin)")
async def export_classroom_report(
    id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Ангийн сурагчдын амжилт, XP, бодлого бодсон тайланг CSV файл болгон татах."""
    c_res = await db.execute(
        select(Classroom).options(selectinload(Classroom.students)).where(Classroom.id == id)
    )
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")

    # Зөвхөн ангийн багш эсвэл админ тайлан авна
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Танд тайлан экспортлох зөвшөөрөл байхгүй.")

    student_ids = [s.student_id for s in classroom.students]
    if not student_ids:
        raise HTTPException(status_code=400, detail="Энэ ангид ямар ч сурагч элсээгүй байна.")

    # Сурагчдын прогресс өгөгдлийг DB-ээс татах
    progress_query = (
        select(
            User.username,
            User.full_name,
            User.email,
            StudentLevel.name.label("level_name"),
            StudentProgress.total_xp,
            StudentProgress.solved_count,
            StudentProgress.current_streak,
            StudentProgress.highest_streak,
            StudentProgress.elo_rating,
            ClassroomStudent.joined_at
        )
        .join(StudentProgress, StudentProgress.user_id == User.id)
        .join(StudentLevel, StudentLevel.id == StudentProgress.current_level_id)
        .join(ClassroomStudent, ClassroomStudent.student_id == User.id)
        .where(
            User.id.in_(student_ids),
            ClassroomStudent.classroom_id == id
        )
    )
    progress_res = await db.execute(progress_query)
    records = progress_res.all()

    # CSV файл үүсгэх
    import io
    import csv

    output = io.StringIO()
    # Excel-д Монгол үсэг зөв унших UTF-8 BOM
    output.write('\ufeff')
    
    writer = csv.writer(output)
    writer.writerow([
        "Сурагчийн нэр",
        "Овог нэр",
        "Имэйл",
        "Түвшин",
        "Нийт XP",
        "Бодсон бодлого",
        "Одоогийн Streak",
        "Хамгийн дээд Streak",
        "Elo рейтинг",
        "Ангид элссэн огноо"
    ])

    for row in records:
        writer.writerow([
            row.username,
            row.full_name or "",
            row.email,
            row.level_name,
            row.total_xp,
            row.solved_count,
            row.current_streak,
            row.highest_streak,
            row.elo_rating,
            row.joined_at.strftime("%Y-%m-%d %H:%M:%S")
        ])

    output.seek(0)
    
    filename = f"classroom_{id}_report_{datetime.now().strftime('%Y%md_%H%M')}.csv"
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
    }

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv',
        headers=headers
    )


# ─── Classroom Lesson Management (Pattern 3 Many-to-Many) ────────────────────

@router.get("/{classroom_id}/lessons", response_model=List[LessonListItem])
async def list_classroom_lessons(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Ангид холбогдсон хичээлүүдийг жагсаах"""
    c_res = await db.execute(
        select(Classroom).options(selectinload(Classroom.students)).where(Classroom.id == classroom_id)
    )
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
        
    is_member = any(s.student_id == current_user.id for s in classroom.students if s.status == "approved")
    is_teacher_or_admin = (classroom.teacher_id == current_user.id or current_user.role.value == "admin")
    if not is_teacher_or_admin and not is_member:
        raise HTTPException(status_code=403, detail="Харах эрхгүй байна.")

    query = (
        select(Lesson, ClassroomLesson.order, ClassroomLesson.is_published)
        .join(ClassroomLesson, ClassroomLesson.lesson_id == Lesson.id)
        .where(ClassroomLesson.classroom_id == classroom_id)
        .options(
            selectinload(Lesson.practice_problems),
            selectinload(Lesson.created_by),
            selectinload(Lesson.classroom_lessons)
        )
    )
    
    if not is_teacher_or_admin:
        query = query.where(ClassroomLesson.is_published == True)
        
    result = await db.execute(query.order_by(ClassroomLesson.order))
    rows = result.all()
    
    completed_lesson_ids: set = set()
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
    
    out = []
    for lesson, cl_order, cl_is_published in rows:
        item = _lesson_to_list_item(lesson, completed_lesson_ids, include_meta=True)
        item["order"] = cl_order
        item["is_published"] = cl_is_published
        out.append(item)
        
    return out


@router.get("/{classroom_id}/available-lessons", response_model=List[LessonListItem])
async def list_available_lessons_for_classroom(
    classroom_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Ангид холбогдоогүй байгаа, холбох боломжтой багшийн/нийтийн хичээлүүдийг жагсаах"""
    c_res = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
        
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш/админ харах эрхтэй.")

    # Аль хэдийн холбогдсон хичээлүүд
    linked_res = await db.execute(
        select(ClassroomLesson.lesson_id).where(ClassroomLesson.classroom_id == classroom_id)
    )
    linked_ids = [row[0] for row in linked_res.fetchall()]

    query = (
        select(Lesson)
        .options(
            selectinload(Lesson.practice_problems),
            selectinload(Lesson.created_by),
            selectinload(Lesson.classroom_lessons)
        )
    )
    if current_user.role.value == "teacher":
        query = query.where(Lesson.created_by_id == current_user.id)
        
    if linked_ids:
        query = query.where(Lesson.id.not_in(linked_ids))
        
    result = await db.execute(query.order_by(Lesson.order))
    lessons = result.scalars().all()
    
    return [_lesson_to_list_item(l, set(), include_meta=True) for l in lessons]


@router.post("/{classroom_id}/lessons/{lesson_id}", status_code=status.HTTP_201_CREATED)
async def link_lesson_to_classroom(
    classroom_id: int,
    lesson_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Хичээлийг ангитай холбох"""
    c_res = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш/админ хичээл холбох эрхтэй.")

    l_res = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = l_res.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Хичээл олдсонгүй.")

    exist_res = await db.execute(
        select(ClassroomLesson).where(
            and_(
                ClassroomLesson.classroom_id == classroom_id,
                ClassroomLesson.lesson_id == lesson_id
            )
        )
    )
    if exist_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Энэ хичээл уг ангид аль хэдийн холбогдсон байна.")

    order_res = await db.execute(
        select(func.max(ClassroomLesson.order)).where(ClassroomLesson.classroom_id == classroom_id)
    )
    max_order = order_res.scalar() or 0

    cl = ClassroomLesson(
        classroom_id=classroom_id,
        lesson_id=lesson_id,
        order=max_order + 1,
        is_published=True
    )
    db.add(cl)
    await db.commit()
    return {"status": "success", "message": f"'{lesson.title}' хичээлийг ангитай амжилттай холболоо."}


@router.delete("/{classroom_id}/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_lesson_from_classroom(
    classroom_id: int,
    lesson_id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Хичээлийг ангиас салгах (холбоосыг устгах)"""
    c_res = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш/админ холбоос цуцлах эрхтэй.")

    cl_res = await db.execute(
        select(ClassroomLesson).where(
            and_(
                ClassroomLesson.classroom_id == classroom_id,
                ClassroomLesson.lesson_id == lesson_id
            )
        )
    )
    cl = cl_res.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Холбоос олдсонгүй.")

    await db.delete(cl)
    await db.commit()
    return None


@router.put("/{classroom_id}/lessons/{lesson_id}/order")
async def update_classroom_lesson_properties(
    classroom_id: int,
    lesson_id: int,
    payload: ClassroomLessonUpdate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Анги доторх хичээлийн харагдах дараалал эсвэл нийтлэгдсэн төлөвийг өөрчлөх"""
    c_res = await db.execute(select(Classroom).where(Classroom.id == classroom_id))
    classroom = c_res.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=404, detail="Анги танхим олдсонгүй.")
    if classroom.teacher_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Зөвхөн ангийн багш/админ засварлах эрхтэй.")

    cl_res = await db.execute(
        select(ClassroomLesson).where(
            and_(
                ClassroomLesson.classroom_id == classroom_id,
                ClassroomLesson.lesson_id == lesson_id
            )
        )
    )
    cl = cl_res.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Холбоос олдсонгүй.")

    if payload.order is not None:
        cl.order = payload.order
    if payload.is_published is not None:
        cl.is_published = payload.is_published

    await db.commit()
    return {"status": "success", "message": "Хичээлийн тохиргоо шинэчлэгдлээ."}


