import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.problem import Problem
from app.models.progression import StudentProgress
from app.services.ai_service import ai_service_client
from app.services.xp_engine import notify_gamification_update

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class SocraticQuery(BaseModel):
    problem_code: str
    current_code: str
    student_question: str
    hint_level: int = 1 # 1: Concept (0XP), 2: Edge Case (-5XP), 3: Pseudocode (-10XP)
    last_error: Optional[str] = None

class SocraticResponse(BaseModel):
    hint_level: int
    hint_title: str
    guidance_message: str
    xp_penalty: int
    suggested_followups: List[str]

class ComplexityQuery(BaseModel):
    source_code: str

class ComplexityResponse(BaseModel):
    analysis: str

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/ask", response_model=SocraticResponse)
async def ask_socratic_tutor(
    payload: SocraticQuery,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Сурагчид кодынх нь алдааг олоход socratic чиглүүлэг өгнө.
    - Hint 1: 0 XP (Концепцийн сануулга)
    - Hint 2: -5 XP (Захын утгын сануулга)
    - Hint 3: -10 XP (Псевдокод заавар)
    """
    level = payload.hint_level if payload.hint_level in [1, 2, 3] else 1

    # Бодлогыг хайж олох
    p_res = await db.execute(select(Problem).where(Problem.code == payload.problem_code))
    problem = p_res.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Бодлого олдсонгүй.")

    # AI Mentor үйлчилгээг дуудах
    title, message, penalty, followups = await ai_service_client.ask_socratic_mentor(
        problem_code=problem.code,
        problem_title=problem.title,
        problem_statement=problem.statement_markdown,
        student_code=payload.current_code,
        student_question=payload.student_question,
        hint_level=level,
        last_error=payload.last_error
    )

    # XP Penalty хасах (Зөвхөн сурагчдын хувьд)
    if penalty > 0 and current_user.role.value == "student":
        prog_res = await db.execute(
            select(StudentProgress).where(StudentProgress.user_id == current_user.id)
        )
        progress = prog_res.scalar_one_or_none()
        if progress:
            old_xp = progress.total_xp
            progress.total_xp = max(0, progress.total_xp - penalty)
            await db.commit()
            
            # WebSocket рүү геймификацийн penalty мэдэгдэл илгээх
            await notify_gamification_update(str(current_user.id), {
                "event": "XP_PENALTY",
                "amount": penalty,
                "reason": f"Хиймэл оюунаас сануулга (Түвшин {level}) авсан",
                "total_xp": progress.total_xp
            })
            logger.info(f"User {current_user.id} charged {penalty} XP. XP: {old_xp} -> {progress.total_xp}")

    return {
        "hint_level": level,
        "hint_title": title,
        "guidance_message": message,
        "xp_penalty": penalty,
        "suggested_followups": followups
    }

@router.post("/complexity-audit", response_model=ComplexityResponse)
async def audit_code_complexity(
    payload: ComplexityQuery,
    current_user: User = Depends(get_current_user)
):
    """Кодын цаг болон санах ойн Big-O хүндрэлийн шинжилгээг буцаана."""
    analysis = await ai_service_client.get_complexity_audit(payload.source_code)
    return {"analysis": analysis}
