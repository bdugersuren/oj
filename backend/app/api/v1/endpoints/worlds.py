import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.gamification import World, Stage, StageProblem
from app.models.progression import StudentProgress, StudentLevel
from app.models.submission import Submission, SubmissionStatus
from app.models.problem import Problem

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class StageProblemOut(BaseModel):
    id: int
    problem_id: int
    code: str
    title: str
    difficulty: str
    points: int
    is_required: bool
    order: int
    is_solved: bool = False

class StageListItem(BaseModel):
    id: int
    slug: str
    title: str
    description: Optional[str]
    order: int
    is_locked: bool = True
    is_completed: bool = False
    problems_count: int
    solved_count: int

class WorldListItem(BaseModel):
    id: int
    slug: str
    title: str
    description: Optional[str]
    order: int
    required_level_id: int
    required_level_name: str
    stages: List[StageListItem]

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[WorldListItem])
async def list_worlds(
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Бүх World, Stage-ийг ачаалах
    worlds_query = select(World).options(
        selectinload(World.stages).selectinload(Stage.stage_problems).selectinload(StageProblem.problem)
    ).order_by(World.order)
    
    result = await db.execute(worlds_query)
    worlds = result.scalars().all()

    # Сурагчийн прогрессыг ачаалах
    student_progress = None
    solved_problem_ids = set()
    user_level_order = 0
    
    if current_user:
        prog_res = await db.execute(
            select(StudentProgress)
            .options(selectinload(StudentProgress.level))
            .where(StudentProgress.user_id == current_user.id)
        )
        student_progress = prog_res.scalar_one_or_none()
        
        if student_progress:
            user_level_order = student_progress.level.order
            
            # Хэрэглэгчийн зөв бодсон бодлогын ID-уудыг авах
            sub_res = await db.execute(
                select(Submission.problem_id)
                .where(Submission.user_id == current_user.id, Submission.status == SubmissionStatus.ACCEPTED)
            )
            solved_problem_ids = {row[0] for row in sub_res.fetchall()}

    # Олон нийтийн түвшний нэрсийг олох
    lvl_res = await db.execute(select(StudentLevel))
    lvl_map = {lvl.id: (lvl.name, lvl.order) for lvl in lvl_res.scalars().all()}

    worlds_out = []
    # Шатуудын нээгдэх логикийг тооцоолох
    # World 1, Stage 1 нь анхнаасаа нээлттэй байна.
    previous_stage_completed = True 

    for w in worlds:
        lvl_name, lvl_order = lvl_map.get(w.required_level_id, ("Bronze", 1))
        
        # Хэрэглэгчийн түвшин энэ World-д хүрэх эсэх
        world_locked_by_level = user_level_order < lvl_order if student_progress else False

        stages_out = []
        for s in w.stages:
            total_req_problems = [sp for sp in s.stage_problems if sp.is_required]
            solved_req_problems = [sp for sp in total_req_problems if sp.problem_id in solved_problem_ids]
            
            # Энэ шатны бүх required бодлогуудыг бодсон бол дууссанд тооцно
            is_completed = len(solved_req_problems) == len(total_req_problems) if total_req_problems else True
            
            # Энэ шат нээлттэй байх нөхцөл:
            # 1. Түвшин хүрэлцэж байх (World түвшин)
            # 2. Өмнөх шатыг бүрэн дуусгасан байх
            is_locked = True
            if not world_locked_by_level and previous_stage_completed:
                is_locked = False

            stages_out.append({
                "id": s.id,
                "slug": s.slug,
                "title": s.title,
                "description": s.description,
                "order": s.order,
                "is_locked": is_locked,
                "is_completed": is_completed,
                "problems_count": len(s.stage_problems),
                "solved_count": len([sp for sp in s.stage_problems if sp.problem_id in solved_problem_ids])
            })
            
            # Дараагийн шатны нээгдэх нөхцөлийг шинэчилнэ
            previous_stage_completed = is_completed and not is_locked

        worlds_out.append({
            "id": w.id,
            "slug": w.slug,
            "title": w.title,
            "description": w.description,
            "order": w.order,
            "required_level_id": w.required_level_id,
            "required_level_name": lvl_name,
            "stages": stages_out
        })

    return worlds_out

@router.get("/{slug}/stages", response_model=List[StageProblemOut])
async def get_stage_problems(
    slug: str,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Stage)
        .options(selectinload(Stage.stage_problems).selectinload(StageProblem.problem))
        .where(Stage.slug == slug)
    )
    stage = result.scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Шат олдсонгүй.")

    # Хэрэглэгчийн зөв бодсон бодлогын ID-уудыг авах
    solved_problem_ids = set()
    if current_user:
        sub_res = await db.execute(
            select(Submission.problem_id)
            .where(Submission.user_id == current_user.id, Submission.status == SubmissionStatus.ACCEPTED)
        )
        solved_problem_ids = {row[0] for row in sub_res.fetchall()}

    problems_out = []
    for sp in stage.stage_problems:
        p = sp.problem
        if p:
            problems_out.append({
                "id": sp.id,
                "problem_id": p.id,
                "code": p.code,
                "title": p.title,
                "difficulty": p.difficulty.value if hasattr(p.difficulty, "value") else str(p.difficulty),
                "points": p.points,
                "is_required": sp.is_required,
                "order": sp.order,
                "is_solved": p.id in solved_problem_ids
            })

    return problems_out
