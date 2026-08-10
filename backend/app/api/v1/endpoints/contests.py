import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.core.dependencies import require_role
from app.models.user import User
from app.models.contest import Contest, ContestProblem, ContestParticipant, Team, TeamMember, ContestTeam
from app.models.problem import Problem
from app.models.submission import Submission, SubmissionStatus
import secrets

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class ContestProblemOut(BaseModel):
    id: int
    problem_id: int
    code: str
    title: str
    points: int
    order: int

class ContestListItem(BaseModel):
    id: int
    title: str
    description: Optional[str]
    start_time: datetime
    end_time: datetime
    creator_name: str
    is_public: bool
    is_registered: bool = False
    status: str # "upcoming", "running", "ended"

class ContestDetail(BaseModel):
    id: int
    title: str
    description: Optional[str]
    start_time: datetime
    end_time: datetime
    is_public: bool
    problems: List[ContestProblemOut]
    is_registered: bool = False

class ContestCreateProblem(BaseModel):
    problem_code: str
    points: int = 100
    order: int = 1

class ContestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_public: bool = True
    problems: List[ContestCreateProblem] = []

# ─── Standing Schema ──────────────────────────────────────────────────────────

class ProblemResult(BaseModel):
    problem_code: str
    score: int
    attempts: int
    time_ms: float = 0.0

class StandingRow(BaseModel):
    rank: int
    user_id: str
    username: str
    total_score: int
    total_time_ms: float
    problem_results: List[ProblemResult]

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ContestListItem])
async def list_contests(
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Contest).options(selectinload(Contest.creator)).order_by(Contest.start_time.desc())
    result = await db.execute(query)
    contests = result.scalars().all()

    # Хэрэглэгч бүртгүүлсэн эсэхийг ачаалах
    registered_ids = set()
    if current_user:
        part_res = await db.execute(
            select(ContestParticipant.contest_id)
            .where(ContestParticipant.user_id == current_user.id)
        )
        registered_ids = {row[0] for row in part_res.fetchall()}

    now = datetime.utcnow()
    out = []
    for c in contests:
        if c.start_time > now:
            c_status = "upcoming"
        elif c.end_time < now:
            c_status = "ended"
        else:
            c_status = "running"

        out.append({
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "start_time": c.start_time,
            "end_time": c.end_time,
            "creator_name": c.creator.username if c.creator else "Admin",
            "is_public": c.is_public,
            "is_registered": c.id in registered_ids,
            "status": c_status
        })
    return out

@router.post("/", response_model=ContestDetail, status_code=status.HTTP_201_CREATED)
async def create_contest(
    payload: ContestCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    start_naive = payload.start_time.replace(tzinfo=None) if payload.start_time.tzinfo else payload.start_time
    end_naive = payload.end_time.replace(tzinfo=None) if payload.end_time.tzinfo else payload.end_time

    if start_naive >= end_naive:
        raise HTTPException(status_code=400, detail="Эхлэх хугацаа дуусах хугацаанаас өмнө байх ёстой.")

    contest = Contest(
        title=payload.title,
        description=payload.description,
        start_time=start_naive,
        end_time=end_naive,
        creator_id=current_user.id,
        is_public=payload.is_public
    )
    db.add(contest)
    await db.flush()

    for p_payload in payload.problems:
        # Бодлогыг код болон ID-аар олох
        p_res = await db.execute(select(Problem).where(Problem.code == p_payload.problem_code))
        prob = p_res.scalar_one_or_none()
        if not prob:
            raise HTTPException(status_code=404, detail=f"Бодлогын код '{p_payload.problem_code}' олдсонгүй.")
        
        cp = ContestProblem(
            contest_id=contest.id,
            problem_id=prob.id,
            points=p_payload.points,
            order=p_payload.order
        )
        db.add(cp)

    await db.commit()
    return await get_contest_detail(contest.id, current_user, db)

@router.get("/{id}", response_model=ContestDetail)
async def get_contest_detail(
    id: int,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Contest)
        .options(
            selectinload(Contest.problems).selectinload(ContestProblem.problem)
        )
        .where(Contest.id == id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Тэмцээн олдсонгүй.")

    is_registered = False
    if current_user:
        part_res = await db.execute(
            select(ContestParticipant)
            .where(ContestParticipant.contest_id == id, ContestParticipant.user_id == current_user.id)
        )
        is_registered = part_res.scalar_one_or_none() is not None

    problems_out = []
    # Хэрэв тэмцээн эхлээгүй бөгөөд сурагч бол бодлогуудыг харуулахгүй нууна.
    now = datetime.utcnow()
    is_admin_or_teacher = current_user and current_user.role in ["admin", "teacher"]
    
    if contest.start_time <= now or is_admin_or_teacher:
        for cp in contest.problems:
            if cp.problem:
                problems_out.append({
                    "id": cp.id,
                    "problem_id": cp.problem_id,
                    "code": cp.problem.code,
                    "title": cp.problem.title,
                    "points": cp.points,
                    "order": cp.order
                })

    return {
        "id": contest.id,
        "title": contest.title,
        "description": contest.description,
        "start_time": contest.start_time,
        "end_time": contest.end_time,
        "is_public": contest.is_public,
        "problems": problems_out,
        "is_registered": is_registered
    }

@router.post("/{id}/register")
async def register_contest(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    contest_res = await db.execute(select(Contest).where(Contest.id == id))
    contest = contest_res.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Тэмцээн олдсонгүй.")

    now = datetime.utcnow()
    if contest.end_time < now:
        raise HTTPException(status_code=400, detail="Тэмцээн хэдийнэ дууссан байна.")

    # Өмнө бүртгүүлсэн эсэхийг шалгах
    exist_res = await db.execute(
        select(ContestParticipant)
        .where(ContestParticipant.contest_id == id, ContestParticipant.user_id == current_user.id)
    )
    if exist_res.scalar_one_or_none():
        return {"message": "Та аль хэдийн бүртгүүлсэн байна."}

    participant = ContestParticipant(contest_id=id, user_id=current_user.id)
    db.add(participant)
    await db.commit()

    return {"status": "success", "message": "Тэмцээнд амжилттай бүртгүүллээ."}

@router.get("/{id}/standings", response_model=List[StandingRow])
async def get_contest_standings(
    id: int,
    db: AsyncSession = Depends(get_db)
):
    """Бодит цагийн Standings жагсаалт тооцоолох."""
    # 1. Тэмцээний өгөгдөл болон бодлогуудыг ачаалах
    contest_res = await db.execute(
        select(Contest)
        .options(selectinload(Contest.problems).selectinload(ContestProblem.problem))
        .where(Contest.id == id)
    )
    contest = contest_res.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Тэмцээн олдсонгүй.")

    # 2. Бүх оролцогчдыг авах
    part_res = await db.execute(
        select(ContestParticipant)
        .options(selectinload(ContestParticipant.user))
        .where(ContestParticipant.contest_id == id)
    )
    participants = part_res.scalars().all()

    # 3. Тэмцээний хугацаанд илгээгдсэн бүх submissions-уудыг шүүх
    sub_res = await db.execute(
        select(Submission)
        .where(
            Submission.submitted_at >= contest.start_time,
            Submission.submitted_at <= contest.end_time,
            Submission.problem_id.in_([cp.problem_id for cp in contest.problems])
        )
        .order_by(Submission.submitted_at.asc())
    )
    submissions = sub_res.scalars().all()

    # Бодлогын код, ID харилцан хамаарал үүсгэх
    prob_id_to_code = {cp.problem_id: cp.problem.code for cp in contest.problems if cp.problem}
    prob_max_points = {cp.problem_id: cp.points for cp in contest.problems}

    # Оролцогч бүрийн үр дүнг тооцоолох
    # standings_data = { user_id: { username, total_score, total_time_ms, problem_results: { prob_id: { score, attempts, last_ac_time } } } }
    standings_data = {}
    for p in participants:
        standings_data[p.user_id] = {
            "user_id": str(p.user_id),
            "username": p.user.username,
            "total_score": 0,
            "total_time_ms": 0.0,
            "problem_results": {pid: {"score": 0, "attempts": 0, "time_ms": 0.0} for pid in prob_id_to_code.keys()}
        }

    # Submissions боловсруулах
    for s in submissions:
        if s.user_id not in standings_data:
            continue # Бүртгэлгүй хэрэглэгч
            
        prob_res = standings_data[s.user_id]["problem_results"][s.problem_id]
        
        # Хэрэв аль хэдийн 100% зөв AC авсан бол дараагийн илгээлтүүд оноонд нөлөөлөхгүй
        max_limit = prob_max_points[s.problem_id]
        if prob_res["score"] >= max_limit:
            continue
            
        prob_res["attempts"] += 1
        
        # Олгох оноог тооцоолох (Бодлогын авсан хувь * Тэмцээний бодлогын max оноо)
        # Жишээ нь: IOI дүрэм
        sub_score = int((s.score / 100.0) * max_limit) if s.score else 0
        if s.status == SubmissionStatus.ACCEPTED:
            sub_score = max_limit

        if sub_score > prob_res["score"]:
            prob_res["score"] = sub_score
            # Тэмцээн эхэлснээс хойшх хугацаа (ms)
            duration = (s.submitted_at - contest.start_time).total_seconds() * 1000
            prob_res["time_ms"] = duration

    # 4. Нийлбэр дүнгүүдийг олох
    rows = []
    for uid, data in standings_data.items():
        total_score = 0
        total_time_ms = 0.0
        p_results_list = []
        
        for pid, res in data["problem_results"].items():
            total_score += res["score"]
            total_time_ms += res["time_ms"]
            p_results_list.append({
                "problem_code": prob_id_to_code[pid],
                "score": res["score"],
                "attempts": res["attempts"],
                "time_ms": res["time_ms"]
            })
            
        rows.append({
            "user_id": str(uid),
            "username": data["username"],
            "total_score": total_score,
            "total_time_ms": total_time_ms,
            "problem_results": p_results_list
        })

    # 5. Байр эзлүүлэх эрэмбэ:
    #   - 1. Нийт оноо (Их нь эхэнд)
    #   - 2. Нийт хугацаа (Бага нь эхэнд)
    rows.sort(key=lambda x: (-x["total_score"], x["total_time_ms"]))

    # Байрын дугаар (rank) олгох
    for idx, r in enumerate(rows):
        r["rank"] = idx + 1

    return rows


# ─── Team Schemas ───────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str
    school: Optional[str] = None

class TeamJoin(BaseModel):
    invite_code: str

class TeamMemberOut(BaseModel):
    user_id: str
    username: str

class TeamOut(BaseModel):
    id: int
    name: str
    school: Optional[str]
    invite_code: str
    created_at: datetime
    members: List[TeamMemberOut]

class TeamProblemResult(BaseModel):
    problem_code: str
    score: int
    attempts: int
    time_minutes: float
    is_solved: bool

class TeamStandingRow(BaseModel):
    rank: int
    team_id: int
    team_name: str
    school: Optional[str]
    members: List[str]
    solved_count: int
    total_penalty: float
    problem_results: List[TeamProblemResult]
    balloons: List[str]


# ─── Team Endpoints ─────────────────────────────────────────────────────────

@router.post("/teams", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Хэрэглэгч аль хэдийн багтай эсэхийг шалгах
    exist_member = await db.execute(
        select(TeamMember).where(TeamMember.user_id == current_user.id)
    )
    if exist_member.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Та аль хэдийн багт харьяалагдсан байна. Шинэ баг үүсгэхийн тулд өмнөх багоосоо гарна уу."
        )

    # Дахин давтагдашгүй invite_code үүсгэх
    while True:
        invite_code = secrets.token_hex(4).upper()
        code_check = await db.execute(select(Team).where(Team.invite_code == invite_code))
        if not code_check.scalar_one_or_none():
            break

    team = Team(
        name=payload.name,
        school=payload.school,
        invite_code=invite_code
    )
    db.add(team)
    await db.flush()

    member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        is_captain=True
    )
    db.add(member)
    await db.commit()

    # Буцаах мэдээлэл авах
    return await get_my_team(current_user, db)


@router.post("/teams/join", response_model=TeamOut)
async def join_team(
    payload: TeamJoin,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Хэрэглэгч өөр багт байгаа эсэхийг шалгах
    exist_member = await db.execute(
        select(TeamMember).where(TeamMember.user_id == current_user.id)
    )
    if exist_member.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Та аль хэдийн өөр багт харьяалагдсан байна."
        )

    # Кодоор багийг олох
    team_res = await db.execute(
        select(Team)
        .options(selectinload(Team.members))
        .where(Team.invite_code == payload.invite_code.upper())
    )
    team = team_res.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Буруу урилгын код байна. Баг олдсонгүй.")

    # Багийн гишүүдийн тоог шалгах (макс 3 гишүүн)
    if len(team.members) >= 3:
        raise HTTPException(status_code=400, detail="Уучлаарай, энэ баг дүүрсэн байна (макс 3 гишүүн).")

    member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        is_captain=False
    )
    db.add(member)
    await db.commit()

    return await get_my_team(current_user, db)


@router.get("/teams/my", response_model=TeamOut)
async def get_my_team(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    member_res = await db.execute(
        select(TeamMember)
        .options(selectinload(TeamMember.team).selectinload(Team.members).selectinload(TeamMember.user))
        .where(TeamMember.user_id == current_user.id)
    )
    member = member_res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Та ямар нэгэн багт харьяалагдаагүй байна.")

    team = member.team
    
    # Гишүүдийн хэрэглэгчийн нэрийг ачаалах
    members_out = []
    for m in team.members:
        user_res = await db.execute(select(User).where(User.id == m.user_id))
        user = user_res.scalar_one()
        members_out.append({
            "user_id": str(user.id),
            "username": user.username
        })

    return {
        "id": team.id,
        "name": team.name,
        "school": team.school,
        "invite_code": team.invite_code,
        "created_at": team.created_at,
        "members": members_out
    }


@router.post("/{id}/teams/register")
async def register_team_for_contest(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    contest_res = await db.execute(select(Contest).where(Contest.id == id))
    contest = contest_res.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Тэмцээн олдсонгүй.")

    now = datetime.utcnow()
    if contest.end_time < now:
        raise HTTPException(status_code=400, detail="Тэмцээн хэдийнэ дууссан байна.")

    # Хэрэглэгчийн багийг олох
    member_res = await db.execute(
        select(TeamMember)
        .options(selectinload(TeamMember.team).selectinload(Team.members))
        .where(TeamMember.user_id == current_user.id)
    )
    member = member_res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=400, detail="Тэмцээнд бүртгүүлэхийн тулд эхлээд баг үүсгэх эсвэл багт нэгдэнэ үү.")

    if not member.is_captain:
        raise HTTPException(status_code=403, detail="Зөвхөн багийн ахлагч тэмцээнд бүртгүүлэх эрхтэй.")

    team = member.team

    # Баг өмнө нь бүртгүүлсэн эсэхийг шалгах
    exist_res = await db.execute(
        select(ContestTeam)
        .where(ContestTeam.contest_id == id, ContestTeam.team_id == team.id)
    )
    if exist_res.scalar_one_or_none():
        return {"message": "Танай баг аль хэдийн бүртгүүлсэн байна."}

    # ContestTeam бичлэг үүсгэх
    contest_team = ContestTeam(contest_id=id, team_id=team.id)
    db.add(contest_team)

    # Багийн бүх гишүүдийг автоматаар ContestParticipant руу нэмэх
    for m in team.members:
        part_check = await db.execute(
            select(ContestParticipant)
            .where(ContestParticipant.contest_id == id, ContestParticipant.user_id == m.user_id)
        )
        if not part_check.scalar_one_or_none():
            db.add(ContestParticipant(contest_id=id, user_id=m.user_id))

    await db.commit()
    return {"status": "success", "message": f"Танай баг ({team.name}) тэмцээнд амжилттай бүртгүүллээ."}


@router.get("/{id}/team-standings", response_model=List[TeamStandingRow])
async def get_contest_team_standings(
    id: int,
    db: AsyncSession = Depends(get_db)
):
    """ICPC дүрмээр бодит цагийн Багийн Standings бодох (Хувилбар Б)."""
    # 1. Тэмцээн болон бодлого ачаалах
    contest_res = await db.execute(
        select(Contest)
        .options(selectinload(Contest.problems).selectinload(ContestProblem.problem))
        .where(Contest.id == id)
    )
    contest = contest_res.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Тэмцээн олдсонгүй.")

    # 2. Тэмцээнд бүртгэлтэй багуудыг авах
    ct_res = await db.execute(
        select(ContestTeam)
        .options(selectinload(ContestTeam.team).selectinload(Team.members))
        .where(ContestTeam.contest_id == id)
    )
    contest_teams = ct_res.scalars().all()

    # 3. Тэмцээний бодлогуудын мэдээлэл
    prob_ids = [cp.problem_id for cp in contest.problems]
    prob_id_to_code = {cp.problem_id: cp.problem.code for cp in contest.problems if cp.problem}
    prob_max_points = {cp.problem_id: cp.points for cp in contest.problems}

    # Бөмбөлөгний өнгөний зураглал (А: Улаан, B: Ногоон, C: Цэнхэр, D: Шар, E: Нил ягаан ...)
    BALLOON_HEX = ["#ef4444", "#10b981", "#06b6d4", "#f59e0b", "#8b5cf6"]

    # 4. Баг тус бүрийн логик тооцоолол
    rows = []
    for ct in contest_teams:
        team = ct.team
        member_ids = [m.user_id for m in team.members]

        # Багийн гишүүдийн нэрсийг унших
        m_usernames = []
        for m in team.members:
            user_res = await db.execute(select(User.username).where(User.id == m.user_id))
            username = user_res.scalar()
            if username:
                m_usernames.append(username)

        # Тэмцээний үед багийн гишүүдээс илгээсэн submissions
        sub_res = await db.execute(
            select(Submission)
            .where(
                Submission.submitted_at >= contest.start_time,
                Submission.submitted_at <= contest.end_time,
                Submission.problem_id.in_(prob_ids),
                Submission.user_id.in_(member_ids)
            )
            .order_by(Submission.submitted_at.asc())
        )
        team_subs = sub_res.scalars().all()

        # Бодлого тус бүрийн дүн тооцох
        prob_results = {pid: {"score": 0, "attempts": 0, "time_minutes": 0.0, "is_solved": False} for pid in prob_ids}
        
        # Бодлого бүрийн submission-уудыг chronologically шүүх
        for pid in prob_ids:
            p_subs = [s for s in team_subs if s.problem_id == pid]
            max_limit = prob_max_points[pid]
            
            for s in p_subs:
                # Хэрэв аль хэдийн баг AC авсан бол дараагийнхыг алгасна
                if prob_results[pid]["is_solved"]:
                    continue
                
                prob_results[pid]["attempts"] += 1
                sub_score = int((s.score / 100.0) * max_limit) if s.score else 0
                if s.status == SubmissionStatus.ACCEPTED:
                    sub_score = max_limit

                # Хамгийн өндөр оноог хадгалж авах
                if sub_score > prob_results[pid]["score"]:
                    prob_results[pid]["score"] = sub_score
                    duration_mins = (s.submitted_at - contest.start_time).total_seconds() / 60.0
                    prob_results[pid]["time_minutes"] = round(duration_mins, 2)

                if s.status == SubmissionStatus.ACCEPTED:
                    prob_results[pid]["is_solved"] = True

        # Багийн нийлбэр дүн
        solved_count = 0
        total_penalty = 0.0
        balloons = []
        p_res_list = []

        # Тэмцээний бодлогуудын дарааллаар гаргах
        for idx, cp in enumerate(contest.problems):
            pid = cp.problem_id
            res = prob_results[pid]
            
            if res["is_solved"]:
                solved_count += 1
                # Penalty: solve time in minutes + 20 mins for every wrong attempt before solve
                penalty = res["time_minutes"] + 20 * (res["attempts"] - 1)
                total_penalty += penalty
                
                # Бөмбөлөг олгох (индексээр өнгө сонгох)
                color = BALLOON_HEX[idx % len(BALLOON_HEX)]
                balloons.append(color)

            p_res_list.append({
                "problem_code": prob_id_to_code[pid],
                "score": res["score"],
                "attempts": res["attempts"],
                "time_minutes": res["time_minutes"],
                "is_solved": res["is_solved"]
            })

        rows.append({
            "team_id": team.id,
            "team_name": team.name,
            "school": team.school,
            "members": m_usernames,
            "solved_count": solved_count,
            "total_penalty": round(total_penalty, 2),
            "problem_results": p_res_list,
            "balloons": balloons
        })

    # Эрэмбэлэх: 1. Solved count (Их нь эхэнд), 2. Penalty (Бага нь эхэнд)
    rows.sort(key=lambda x: (-x["solved_count"], x["total_penalty"]))

    # Rank олгох
    for idx, r in enumerate(rows):
        r["rank"] = idx + 1

    return rows
