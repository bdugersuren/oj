from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.progression import StudentProgress, StudentLevel, TopicMastery
from app.models.gamification import Achievement, World, Stage

router = APIRouter()

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TopicMasteryOut(BaseModel):
    topic_slug: str
    mastery_percentage: float
    solved_count: int
    attempted_count: int
    wrong_count: int

    model_config = {"from_attributes": True}

class UserProgressOut(BaseModel):
    username: str
    level_name: str
    level_color: str
    level_icon: str
    total_xp: int
    solved_count: int
    current_streak: int
    highest_streak: int
    elo_rating: int
    last_active_date: datetime
    topic_masteries: List[TopicMasteryOut] = []

class LeaderboardItem(BaseModel):
    rank: int
    username: str
    full_name: Optional[str]
    level: str
    level_color: str
    total_xp: int
    solved_count: int
    streak: int
    elo_rating: int


class DuelResolveIn(BaseModel):
    opponent_username: str
    result: str  # "win", "loss", "draw"

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserProgressOut)
async def get_my_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Хэрэглэгчийн явцыг DB-ээс олох
    result = await db.execute(
        select(StudentProgress)
        .options(
            selectinload(StudentProgress.level),
            selectinload(StudentProgress.topic_masteries)
        )
        .where(StudentProgress.user_id == current_user.id)
    )
    progress = result.scalar_one_or_none()

    if not progress:
        # Хэрэв бүртгэгдээгүй байвал шинээр үүсгэнэ
        progress = StudentProgress(
            user_id=current_user.id,
            current_level_id=1,
            total_xp=0,
            solved_count=0,
            current_streak=0,
            highest_streak=0,
            elo_rating=1200
        )
        db.add(progress)
        await db.commit()
        await db.refresh(progress)

        # Түвшингийн мэдээллийг ачаалахын тулд дахин уншина
        result = await db.execute(
            select(StudentProgress)
            .options(selectinload(StudentProgress.level))
            .where(StudentProgress.user_id == current_user.id)
        )
        progress = result.scalar_one()

    level_name = progress.level.name if progress.level else "Bronze"
    level_color = progress.level.color if progress.level else "#cd7f32"
    level_icon = progress.level.icon if progress.level else "Star"

    return {
        "username": current_user.username,
        "level_name": level_name,
        "level_color": level_color,
        "level_icon": level_icon,
        "total_xp": progress.total_xp,
        "solved_count": progress.solved_count,
        "current_streak": progress.current_streak,
        "highest_streak": progress.highest_streak,
        "elo_rating": progress.elo_rating,
        "last_active_date": progress.last_active_date,
        "topic_masteries": progress.topic_masteries
    }

@router.get("/leaderboard", response_model=List[LeaderboardItem])
async def get_leaderboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StudentProgress)
        .options(selectinload(StudentProgress.user), selectinload(StudentProgress.level))
        .order_by(StudentProgress.total_xp.desc())
        .limit(50)
    )
    progress_list = result.scalars().all()
    
    leaderboard = []
    for idx, p in enumerate(progress_list, 1):
        if not p.user:
            continue
        leaderboard.append({
            "rank": idx,
            "username": p.user.username,
            "full_name": p.user.full_name,
            "level": p.level.name if p.level else "Bronze",
            "level_color": p.level.color if p.level else "#cd7f32",
            "total_xp": p.total_xp,
            "solved_count": p.solved_count,
            "streak": p.current_streak,
            "elo_rating": p.elo_rating
        })
    return leaderboard

@router.get("/{username}", response_model=UserProgressOut)
async def get_public_progress(username: str, db: AsyncSession = Depends(get_db)):
    """Public profile мэдээлэл; зөвхөн сургалтын progress-ийг харуулна."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.progress).selectinload(StudentProgress.level), selectinload(User.progress).selectinload(StudentProgress.topic_masteries))
        .where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй.")
    progress = user.progress
    if not progress:
        raise HTTPException(status_code=404, detail="Хэрэглэгчийн progress үүсээгүй байна.")
    level = progress.level
    return {
        "username": user.username,
        "level_name": level.name if level else "Bronze",
        "level_color": level.color if level else "#cd7f32",
        "level_icon": level.icon if level else "Star",
        "total_xp": progress.total_xp,
        "solved_count": progress.solved_count,
        "current_streak": progress.current_streak,
        "highest_streak": progress.highest_streak,
        "elo_rating": progress.elo_rating,
        "last_active_date": progress.last_active_date,
        "topic_masteries": progress.topic_masteries,
    }

@router.get("/achievements")
async def get_achievements(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Achievement))
    return result.scalars().all()

@router.get("/worlds")
async def get_worlds(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(World)
        .options(selectinload(World.stages).selectinload(Stage.stage_problems))
        .order_by(World.order)
    )
    return result.scalars().all()


@router.post("/duel/resolve")
async def resolve_duel(
    payload: DuelResolveIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Get current user progress
    res = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id == current_user.id)
    )
    my_progress = res.scalar_one_or_none()
    
    # Get opponent user
    opp_res = await db.execute(
        select(User).where(User.username == payload.opponent_username)
    )
    opponent = opp_res.scalar_one_or_none()
    if not opponent:
        raise HTTPException(status_code=404, detail="Өрсөлдөгч хэрэглэгч олдсонгүй.")
        
    res_opp = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id == opponent.id)
    )
    opp_progress = res_opp.scalar_one_or_none()
    
    if not my_progress or not opp_progress:
        raise HTTPException(status_code=400, detail="Хэрэглэгчийн прогресс үүсээгүй байна.")
        
    # ELO Calculation
    R_A = my_progress.elo_rating
    R_B = opp_progress.elo_rating
    
    # Expected score for A
    E_A = 1.0 / (1.0 + 10.0 ** ((R_B - R_A) / 400.0))
    # Expected score for B
    E_B = 1.0 / (1.0 + 10.0 ** ((R_A - R_B) / 400.0))
    
    # Actual score
    if payload.result == "win":
        S_A = 1.0
        S_B = 0.0
    elif payload.result == "loss":
        S_A = 0.0
        S_B = 1.0
    else: # draw
        S_A = 0.5
        S_B = 0.5
        
    K = 32
    new_R_A = round(R_A + K * (S_A - E_A))
    new_R_B = round(R_B + K * (S_B - E_B))
    
    # Update
    my_progress.elo_rating = new_R_A
    opp_progress.elo_rating = new_R_B
    
    await db.commit()
    
    # Broadcast progress websocket event
    from app.workers.judge_worker import _publish_gamification_event
    _publish_gamification_event(current_user.id, {
        "event": "DUEL_RESOLVED",
        "result": payload.result,
        "old_rating": R_A,
        "new_rating": new_R_A,
        "change": new_R_A - R_A
    })
    _publish_gamification_event(opponent.id, {
        "event": "DUEL_RESOLVED",
        "result": "win" if payload.result == "loss" else ("loss" if payload.result == "win" else "draw"),
        "old_rating": R_B,
        "new_rating": new_R_B,
        "change": new_R_B - R_B
    })
    
    return {
        "result": payload.result,
        "my_old_rating": R_A,
        "my_new_rating": new_R_A,
        "my_change": new_R_A - R_A,
        "opponent_old_rating": R_B,
        "opponent_new_rating": new_R_B,
        "opponent_change": new_R_B - R_B
    }
