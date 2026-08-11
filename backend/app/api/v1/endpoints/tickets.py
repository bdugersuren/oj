import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole
from app.models.problem import Problem
from app.models.submission import Submission
from app.models.ticket import Ticket, TicketMessage, TicketStatus
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    id: int
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    code_snippet: Optional[str]
    created_at: datetime

class TicketOut(BaseModel):
    id: int
    student_id: str
    student_name: str
    problem_id: int
    problem_code: str
    problem_title: str
    submission_id: Optional[int]
    title: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime]
    messages_count: int

class TicketDetailOut(BaseModel):
    id: int
    student_id: str
    student_name: str
    problem_code: str
    problem_title: str
    submission_id: Optional[int]
    submission_status: Optional[str]
    title: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime]
    messages: List[MessageOut]

class TicketCreate(BaseModel):
    problem_code: str
    submission_id: Optional[int] = None
    title: str
    description: str

class ReplyCreate(BaseModel):
    content: str
    code_snippet: Optional[str] = None

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[TicketOut])
async def list_tickets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Тусламжийн тасалбарын жагсаалт авах.
    - Сурагч бол зөвхөн өөрийн нээсэн тасалбаруудыг харна.
    - Багш эсвэл Админ бол систем дээрх бүх тасалбаруудыг харна.
    """
    query = select(Ticket).options(
        selectinload(Ticket.student),
        selectinload(Ticket.problem),
        selectinload(Ticket.messages)
    )

    # Хэрэв сурагч бол зөвхөн өөрийнхөө тасалбаруудыг шүүнэ
    if current_user.role.value == "student":
        query = query.where(Ticket.student_id == current_user.id)

    result = await db.execute(query.order_by(Ticket.created_at.desc()))
    tickets = result.scalars().all()

    return [
        {
            "id": t.id,
            "student_id": str(t.student_id),
            "student_name": t.student.username if t.student else "Сурагч",
            "problem_id": t.problem_id,
            "problem_code": t.problem.code if t.problem else "NONE",
            "problem_title": t.problem.title if t.problem else "NONE",
            "submission_id": t.submission_id,
            "title": t.title,
            "status": t.status.value,
            "created_at": t.created_at,
            "resolved_at": t.resolved_at,
            "messages_count": len(t.messages)
        }
        for t in tickets
    ]

@router.get("/{id}", response_model=TicketDetailOut)
async def get_ticket_detail(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Тасалбарын дэлгэрэнгүй харилцан яриа болон холбоотой бодолтыг харах."""
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.student),
            selectinload(Ticket.problem),
            selectinload(Ticket.submission),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender)
        )
        .where(Ticket.id == id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Тасалбар олдсонгүй.")

    # Эрхийн шалгалт: Сурагч бол зөвхөн өөрийн тасалбарт хандана
    if current_user.role.value == "student" and ticket.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Танд энэ тасалбарыг харах зөвшөөрөл байхгүй.")

    messages_out = [
        {
            "id": m.id,
            "sender_id": str(m.sender_id),
            "sender_name": m.sender.username if m.sender else "Unknown",
            "sender_role": m.sender.role.value if m.sender else "student",
            "content": m.content,
            "code_snippet": m.code_snippet,
            "created_at": m.created_at
        }
        for m in ticket.messages
    ]

    return {
        "id": ticket.id,
        "student_id": str(ticket.student_id),
        "student_name": ticket.student.username if ticket.student else "Сурагч",
        "problem_code": ticket.problem.code if ticket.problem else "NONE",
        "problem_title": ticket.problem.title if ticket.problem else "NONE",
        "submission_id": ticket.submission_id,
        "submission_status": ticket.submission.status.value if ticket.submission else None,
        "title": ticket.title,
        "status": ticket.status.value,
        "created_at": ticket.created_at,
        "resolved_at": ticket.resolved_at,
        "messages": messages_out
    }

@router.post("/", response_model=TicketDetailOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Шинэ тусламжийн тасалбар нээх."""
    # Зөвхөн сурагч тасалбар нээнэ
    if current_user.role.value != "student":
        raise HTTPException(status_code=403, detail="Зөвхөн сурагчид тусламжийн тасалбар нээх боломжтой.")

    # Бодлогыг олох
    p_res = await db.execute(select(Problem).where(Problem.code == payload.problem_code))
    problem = p_res.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    # Илгээсэн submission байгаа бол баталгаажуулах
    if payload.submission_id:
        sub_res = await db.execute(
            select(Submission).where(Submission.id == payload.submission_id, Submission.user_id == current_user.id)
        )
        if not sub_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Холбох бодолт олдсонгүй эсвэл таны бодолт биш байна.")

    ticket = Ticket(
        student_id=current_user.id,
        problem_id=problem.id,
        submission_id=payload.submission_id,
        title=payload.title,
        status=TicketStatus.OPEN,
    )
    db.add(ticket)
    await db.flush()

    # Эхний тайлбар зурвасыг нэмэх
    first_message = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        content=payload.description
    )
    db.add(first_message)
    await db.commit()

    if settings.ENABLE_AI:
        background_tasks.add_task(generate_ai_ticket_response, ticket.id)

    return await get_ticket_detail(ticket.id, current_user, db)

@router.post("/{id}/reply", response_model=MessageOut)
async def reply_to_ticket(
    id: int,
    payload: ReplyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Тасалбарт хариу зурвас бичих."""
    ticket_res = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = ticket_res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Тасалбар олдсонгүй.")

    # Хэрэв сурагч бол зөвхөн өөрийн тасалбарт зурвас бичих эрхтэй
    if current_user.role.value == "student" and ticket.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Танд энэ тасалбарт хариу бичих зөвшөөрөл байхгүй.")

    # Шинэ зурвас үүсгэх
    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        content=payload.content,
        code_snippet=payload.code_snippet
    )
    db.add(msg)

    # Статус шинэчлэх:
    # Багш/Админ хариулж байвал ANSWERED, сурагч өөрөө хариулж байвал дахин OPEN болгоно
    if current_user.role.value in ("teacher", "admin"):
        ticket.status = TicketStatus.ANSWERED
        ticket.teacher_id = current_user.id
    else:
        ticket.status = TicketStatus.OPEN

    await db.commit()
    await db.refresh(msg)

    return {
        "id": msg.id,
        "sender_id": str(msg.sender_id),
        "sender_name": current_user.username,
        "sender_role": current_user.role.value,
        "content": msg.content,
        "code_snippet": msg.code_snippet,
        "created_at": msg.created_at
    }

@router.post("/{id}/resolve")
async def resolve_ticket(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Тасалбарыг амжилттай шийдэгдсэнээр хаах."""
    ticket_res = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = ticket_res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Тасалбар олдсонгүй.")

    if current_user.role.value == "student" and ticket.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Танд энэ тасалбарыг хаах зөвшөөрөл байхгүй.")

    ticket.status = TicketStatus.RESOLVED
    ticket.resolved_at = datetime.utcnow()
    await db.commit()

    return {"status": "success", "message": "Тасалбарыг амжилттай шийдвэрлэж хаалаа."}


async def generate_ai_ticket_response(ticket_id: int):
    """
    Background Task: Шинэ тасалбарт AI туслах багшийн зүгээс эхний Socratic хариултыг илгээнэ.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.user import User, UserRole
    from app.services.ai_service import ai_service_client
    import uuid

    async with AsyncSessionLocal() as db:
        try:
            # 1. Тасалбарыг ачаалах
            res = await db.execute(
                select(Ticket)
                .options(selectinload(Ticket.messages))
                .where(Ticket.id == ticket_id)
            )
            ticket = res.scalar_one_or_none()
            if not ticket:
                return

            # 2. Бодлогын мэдээлэл авах
            p_res = await db.execute(select(Problem).where(Problem.id == ticket.problem_id))
            problem = p_res.scalar_one_or_none()
            if not problem:
                return

            # 3. Сурагчийн илгээсэн код болон алдааны лог авах
            student_code = ""
            last_error = None
            if ticket.submission_id:
                sub_res = await db.execute(select(Submission).where(Submission.id == ticket.submission_id))
                sub = sub_res.scalar_one_or_none()
                if sub:
                    student_code = sub.source_code or ""
                    last_error = sub.error_log

            # 4. Эхний асуулт / тайлбар
            first_msg = ticket.messages[0].content if ticket.messages else ""

            # 5. AI Mentor хэрэглэгчийг DB-ээс олох эсвэл шинээр үүсгэх
            ai_res = await db.execute(select(User).where(User.username == "ai_mentor"))
            ai_user = ai_res.scalar_one_or_none()
            if not ai_user:
                # Багш эрхтэй хиймэл оюуны туслах үүсгэх (хуудсанд зүүн талд харагдахын тулд)
                ai_user = User(
                    username="ai_mentor",
                    email="ai_mentor@oj.know.mn",
                    hashed_password="ai_mentor_dummy_password_hash_2026",
                    role=UserRole.TEACHER,
                    full_name="AI Mentor (Туслах Багш)",
                    is_verified=True,
                    is_active=True
                )
                db.add(ai_user)
                await db.flush()

            # 6. AI Mentor-оос Socratic чиглүүлэг авах
            title, msg, _, followups = await ai_service_client.ask_socratic_mentor(
                problem_code=problem.code,
                problem_title=problem.title,
                problem_statement=problem.statement_markdown,
                student_code=student_code,
                student_question=first_msg,
                hint_level=1,  # Concept-level hint
                last_error=last_error
            )

            # 7. Зурвас бэлдэх
            content = f"### 🤖 {title}\n\n{msg}\n\n"
            if followups:
                content += "**Чиглүүлэх асуултууд:**\n"
                for q in followups:
                    content += f"- {q}\n"

            # 8. Хариулт нэмэх
            ai_reply = TicketMessage(
                ticket_id=ticket.id,
                sender_id=ai_user.id,
                content=content
            )
            db.add(ai_reply)

            # 9. Тасалбарын статусыг шинэчлэх
            ticket.status = TicketStatus.ANSWERED
            await db.commit()

            # 10. Redis Pub/Sub эсвэл WebSocket-ээр сурагчид мэдэгдэх
            try:
                from app.workers.judge_worker import _publish_gamification_event
                _publish_gamification_event(ticket.student_id, {
                    "event": "TICKET_ANSWERED",
                    "ticket_id": ticket.id,
                    "message": "AI Mentor таны тасалбарт зөвлөгөө илгээлээ."
                })
            except Exception:
                pass

        except Exception as exc:
            logger.exception(f"Error in generate_ai_ticket_response: {exc}")
