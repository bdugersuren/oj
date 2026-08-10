"""
Judge Worker — DMOJ Bridge-тэй холбогдон кодыг шалгах Celery Task

Урсгал:
  POST /submissions  →  DB (PENDING)  →  Celery Task  →  DMOJ Bridge
       →  judge_results хүснэгт  →  Submission.status=AC/WA/TLE/...
       →  Redis Pub/Sub  →  WebSocket  →  Frontend дэлгэц

Phase 1 Mock режим:
  DMOJ Bridge холбогдоогүй үед Test Case тус бүрт Mock дүн буцаадаг.
  ENABLE_JUDGE=True болгосноор бодит DMOJ Bridge-тэй холбогдоно.
"""
import os
import time
import logging
from celery import shared_task

from app.core.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

ENABLE_JUDGE = os.getenv("ENABLE_JUDGE", "false").lower() == "true"

_engine = None
_Session = None

def _get_sync_session():
    global _engine, _Session
    if _engine is None:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        _engine = create_engine(sync_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
        _Session = sessionmaker(bind=_engine)
    return _Session()


# ─── Main Judge Task ──────────────────────────────────────────────────────────

@celery_app.task(
    name="app.workers.judge_worker.execute_submission",
    bind=True,
    max_retries=2,
    default_retry_delay=3,
    queue="judge_queue",
)
def execute_submission(self, submission_id: int):
    """
    Celery Task: submission_id-р тухайн кодыг Judge-д явуулж дүнг DB-д хадгалах.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker, selectinload
    from app.models.submission import Submission, JudgeResult, SubmissionStatus
    from app.models.problem import Problem, TestCase
    from app.models.progression import StudentProgress

    # Sync session reuse
    with _get_sync_session() as db:
        # Submission авах
        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        if not sub:
            logger.error(f"Submission {submission_id} олдсонгүй.")
            return

        # RUNNING статус руу шилжих
        sub.status = SubmissionStatus.RUNNING
        db.commit()

        try:
            # Problem + TestCase авах
            problem = db.query(Problem).filter(Problem.id == sub.problem_id).first()
            test_cases = (
                db.query(TestCase)
                .filter(TestCase.problem_id == sub.problem_id)
                .order_by(TestCase.order)
                .all()
            )

            if not test_cases:
                # TestCase байхгүй — mock AC буцаах
                sub.status = SubmissionStatus.ACCEPTED
                sub.score  = problem.points if problem else 10
                sub.time_ms = 10.0
                db.commit()
                _publish_result(submission_id, sub.status.value, sub.score)
                return

            if ENABLE_JUDGE:
                # ── Бодит DMOJ Bridge дуудлага ─────────────────────────────────
                _judge_via_dmoj(db, sub, problem, test_cases)
            else:
                # ── Mock Judge (Phase 1) ────────────────────────────────────────
                _mock_judge(db, sub, problem, test_cases)

            # XP + Gamification шинэчлэлт
            if sub.status == SubmissionStatus.ACCEPTED:
                _award_xp(db, sub.user_id, problem)

            # Тэмцээний standings шинэчлэлт (оноо авсан бол)
            _update_contest_scoreboard(db, problem.id, sub)

            # Session хаахаас өмнө утгыг cache хийх
            _final_status = sub.status.value
            _final_score  = sub.score

        except Exception as exc:
            logger.exception(f"Judge task алдаа гарлаа: {exc}")
            sub.status    = SubmissionStatus.RUNTIME_ERROR
            sub.error_log = str(exc)
            db.commit()
            _final_status = "RTE"
            _final_score  = 0
            raise self.retry(exc=exc)



    # Redis Pub/Sub-д мэдэгдэл илгээх (session хаалтаас гадна)
    _publish_result(submission_id, _final_status, _final_score)


# ─── Mock Judge (Phase 1) ─────────────────────────────────────────────────────

def _mock_judge(db, sub, problem, test_cases):
    """
    DMOJ Bridge байхгүй үед бүх test_case-д AC буцаана.
    Хурдыг санамсаргүй байдлаар тооцно.
    """
    import random
    from app.models.submission import Submission, JudgeResult, SubmissionStatus
    total_score = 0
    max_time_ms = 0.0
    max_memory_kb = 0.0

    for idx, tc in enumerate(test_cases):
        mock_time   = round(random.uniform(10, problem.time_limit * 800), 2)
        mock_memory = round(random.uniform(500, 8000), 2)
        mock_status = SubmissionStatus.ACCEPTED

        jr = JudgeResult(
            submission_id=sub.id,
            testcase_id=tc.id,
            status=mock_status,
            time_ms=mock_time,
            memory_kb=mock_memory,
        )
        db.add(jr)

        total_score   += tc.points
        max_time_ms    = max(max_time_ms, mock_time)
        max_memory_kb  = max(max_memory_kb, mock_memory)

    sub.status    = SubmissionStatus.ACCEPTED
    sub.score     = total_score
    sub.time_ms   = max_time_ms
    sub.memory_kb = max_memory_kb
    db.commit()


# ─── DMOJ Bridge Judge (Phase 2+) ─────────────────────────────────────────────

def _judge_via_dmoj(db, sub, problem, test_cases):
    """
    DMOJ Bridge-тэй харилцах логик (Phase 2).
    ENABLE_JUDGE=true байх үед ажиллана.
    """
    import socket, json, struct

    BRIDGE_HOST = settings.DMOJ_BRIDGE_HOST
    BRIDGE_PORT = settings.DMOJ_BRIDGE_PORT

    try:
        sock = socket.create_connection((BRIDGE_HOST, BRIDGE_PORT), timeout=10)
        payload = json.dumps({
            "id":       sub.id,
            "problem":  problem.code,
            "language": sub.language,
            "source":   sub.source_code,
            "time_limit": problem.time_limit,
            "memory_limit_mb": problem.memory_limit,
            "testcases": [
                {"id": tc.id, "input_data": tc.input_data, "output_data": tc.output_data, "points": tc.points}
                for tc in test_cases
            ],
        }).encode()
        sock.sendall(struct.pack("!I", len(payload)) + payload)
        sock.settimeout(max(60, int(problem.time_limit * max(1, len(test_cases)) + 30)))

        # Response хүлээх
        header = sock.recv(4)
        if len(header) < 4:
            raise ConnectionError("Bridge хариу буцаасангүй.")
        length = struct.unpack("!I", header)[0]
        data   = b""
        while len(data) < length:
            chunk = sock.recv(length - len(data))
            if not chunk:
                break
            data += chunk
        sock.close()

        verdict = json.loads(data.decode())
        _apply_dmoj_verdict(db, sub, verdict)

    except (ConnectionRefusedError, socket.timeout) as e:
        logger.warning(f"DMOJ Bridge холболт амжилтгүй: {e}. Mock-руу буцлаа.")
        _mock_judge(db, sub, problem, test_cases)


def _apply_dmoj_verdict(db, sub, verdict: dict):
    """DMOJ Bridge-ийн хариуг Submission-д хэрэгжүүлэх."""
    status_map = {
        "AC":  SubmissionStatus.ACCEPTED,
        "WA":  SubmissionStatus.WRONG_ANSWER,
        "TLE": SubmissionStatus.TIME_LIMIT,
        "MLE": SubmissionStatus.MEMORY_LIMIT,
        "RTE": SubmissionStatus.RUNTIME_ERROR,
        "CE":  SubmissionStatus.COMPILATION_ERROR,
    }
    sub.status    = status_map.get(verdict.get("status", "RTE"), SubmissionStatus.RUNTIME_ERROR)
    sub.score     = verdict.get("score", 0)
    sub.time_ms   = verdict.get("time_ms", 0.0)
    sub.memory_kb = verdict.get("memory_kb", 0.0)
    sub.error_log = verdict.get("error_log")

    for tc_result in verdict.get("test_results", []):
        jr = JudgeResult(
            submission_id=sub.id,
            testcase_id=tc_result.get("testcase_id", 0),
            status=status_map.get(tc_result.get("status", "WA"), SubmissionStatus.WRONG_ANSWER),
            time_ms=tc_result.get("time_ms", 0.0),
            memory_kb=tc_result.get("memory_kb", 0.0),
            output_log=tc_result.get("checker_output", ""),
        )
        db.add(jr)

    db.commit()


# ─── XP Engine (Simplified — Phase 2-д бүрэн болгоно) ───────────────────────

def _award_xp(db, user_id, problem):
    """AC дүнд XP олгох, Streak шинэчлэх, Түвшин ба Амжилтуудыг шалгах."""
    from datetime import date, datetime
    from app.models.progression import StudentProgress
    
    progress = db.query(StudentProgress).filter(StudentProgress.user_id == user_id).first()
    if not progress:
        return

    xp = getattr(problem, "xp_reward", 20)
    progress.total_xp    += xp
    progress.solved_count += 1

    # Streak шинэчлэх (Asia/Ulaanbaatar цагийн бүсээр)
    from zoneinfo import ZoneInfo
    from datetime import timezone
    tz = ZoneInfo("Asia/Ulaanbaatar")
    today = datetime.now(tz).date()
    
    if progress.last_active_date:
        # DB-д naive UTC байгаа тул timezone-aware болгоод Ulaanbaatar бүс рүү хөрвүүлнэ
        last_utc = progress.last_active_date.replace(tzinfo=timezone.utc)
        last = last_utc.astimezone(tz).date()
        delta = (today - last).days
        if delta == 1:
            progress.current_streak += 1
        elif delta > 1:
            progress.current_streak = 1
    else:
        progress.current_streak = 1

    if progress.current_streak > progress.highest_streak:
        progress.highest_streak = progress.current_streak

    progress.last_active_date = datetime.utcnow()
    db.commit()
    logger.info(f"User {user_id}: +{xp} XP, streak={progress.current_streak}")

    # Gamification Event-үүдийг шалгаж ажиллуулах
    _publish_gamification_event(user_id, {
        "event": "XP_AWARDED",
        "amount": xp,
        "reason": f"Бодлого бодсон: {problem.title}",
        "total_xp": progress.total_xp
    })

    # Түвшин шалгах
    _check_level_up(db, progress)

    # Амжилт шалгах
    _check_achievements(db, progress)


def _check_level_up(db, progress):
    """Сурагчийн түвшин ахисан эсэхийг sync байдлаар шалгаж шинэчилнэ."""
    from app.models.progression import StudentLevel
    levels = db.query(StudentLevel).order_by(StudentLevel.order.desc()).all()
    
    suitable_level = None
    for lvl in levels:
        if progress.total_xp >= lvl.min_xp and progress.solved_count >= lvl.required_solved:
            suitable_level = lvl
            break
            
    if suitable_level and suitable_level.id != progress.current_level_id:
        old_lvl = db.query(StudentLevel).filter(StudentLevel.id == progress.current_level_id).first()
        old_name = old_lvl.name if old_lvl else "Bronze"
        
        progress.current_level_id = suitable_level.id
        db.commit()
        
        _publish_gamification_event(progress.user_id, {
            "event": "LEVEL_UP",
            "old_level": old_name,
            "new_level": suitable_level.name
        })


def _check_achievements(db, progress):
    """Сурагчийн шинээр нээгдэх амжилтуудыг sync байдлаар шалгаж шинэчилнэ."""
    from app.models.gamification import Achievement, UserAchievement
    
    ACH_RULES = {
        "FIRST_AC": lambda p: p.solved_count >= 1,
        "SOLVED_10": lambda p: p.solved_count >= 10,
        "SOLVED_50": lambda p: p.solved_count >= 50,
        "STREAK_7": lambda p: p.highest_streak >= 7,
        "RATING_1300": lambda p: p.elo_rating >= 1300
    }
    
    # Хэрэглэгчийн аль хэдийн авсан амжилтуудыг авах
    owned = [ua.achievement_id for ua in db.query(UserAchievement).filter(UserAchievement.user_id == progress.user_id).all()]
    
    for code, check_fn in ACH_RULES.items():
        ach = db.query(Achievement).filter(Achievement.code == code).first()
        if ach and ach.id not in owned and check_fn(progress):
            # Шинэ амжилт нээх
            ua = UserAchievement(user_id=progress.user_id, achievement_id=ach.id)
            db.add(ua)
            db.commit()
            
            # Redis Pub/Sub руу илгээх
            _publish_gamification_event(progress.user_id, {
                "event": "ACHIEVEMENT_UNLOCKED",
                "code": ach.code,
                "title": ach.title,
                "description": ach.description,
                "icon": ach.icon,
                "xp_bonus": ach.xp_bonus
            })
            
            # Bonus XP оноо олгох
            progress.total_xp += ach.xp_bonus
            db.commit()


def _publish_gamification_event(user_id, payload):
    """Redis рүү геймификацийн event-үүдийг илгээх helper."""
    try:
        import redis, json
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r.publish(f"user_progress:{user_id}", json.dumps(payload))
    except Exception as e:
        logger.warning(f"Failed to publish gamification event to Redis: {e}")


# ─── Redis Pub/Sub ────────────────────────────────────────────────────────────

def _publish_result(submission_id: int, status: str, score: int):
    """WebSocket handler-т дүнг Redis-ээр дамжуулах."""
    try:
        import redis, json
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r.publish(
            f"submission:{submission_id}",
            json.dumps({"submission_id": submission_id, "status": status, "score": score}),
        )
    except Exception as e:
        logger.warning(f"Redis publish алдаа: {e}")


def _update_contest_scoreboard(db, problem_id, submission):
    """Шинэ илгээлт тэмцээнд хамааралтай бол scoreboard-ийг шинэчлэн Redis Pub/Sub рүү цацна."""
    try:
        from app.models.contest import Contest, ContestProblem, ContestParticipant
        from app.models.submission import Submission, SubmissionStatus
        from datetime import datetime
        import redis, json

        # Идэвхтэй тэмцээн байгаа эсэхийг шалгах (бодлого нь тэмцээнд хамаатай бөгөөд илгээсэн цаг нь тэмцээний үед байх)
        active_contests = db.query(Contest).join(ContestProblem).filter(
            ContestProblem.problem_id == problem_id,
            Contest.start_time <= submission.submitted_at,
            Contest.end_time >= submission.submitted_at
        ).all()

        for contest in active_contests:
            participants = db.query(ContestParticipant).filter(ContestParticipant.contest_id == contest.id).all()
            c_problems = db.query(ContestProblem).filter(ContestProblem.contest_id == contest.id).all()
            
            prob_ids = [cp.problem_id for cp in c_problems]
            prob_id_to_code = {cp.problem_id: cp.problem.code for cp in c_problems if cp.problem}
            prob_max_points = {cp.problem_id: cp.points for cp in c_problems}

            # Тэмцээний үеийн submissions
            subs = db.query(Submission).filter(
                Submission.submitted_at >= contest.start_time,
                Submission.submitted_at <= contest.end_time,
                Submission.problem_id.in_(prob_ids)
            ).order_by(Submission.submitted_at.asc()).all()

            standings = {}
            for p in participants:
                user = p.user
                if not user:
                    continue
                standings[p.user_id] = {
                    "user_id": str(p.user_id),
                    "username": user.username,
                    "total_score": 0,
                    "total_time_ms": 0.0,
                    "problem_results": {pid: {"problem_code": prob_id_to_code[pid], "score": 0, "attempts": 0, "time_ms": 0.0} for pid in prob_ids}
                }

            for s in subs:
                if s.user_id not in standings:
                    continue
                
                p_res = standings[s.user_id]["problem_results"][s.problem_id]
                max_limit = prob_max_points[s.problem_id]
                if p_res["score"] >= max_limit:
                    continue

                p_res["attempts"] += 1
                
                sub_score = int((s.score / 100.0) * max_limit) if s.score else 0
                if s.status == SubmissionStatus.ACCEPTED:
                    sub_score = max_limit

                if sub_score > p_res["score"]:
                    p_res["score"] = sub_score
                    p_res["time_ms"] = (s.submitted_at - contest.start_time).total_seconds() * 1000

            # Нийлбэр дүнгүүд
            rows = []
            for uid, data in standings.items():
                total_score = 0
                total_time_ms = 0.0
                p_res_list = []
                for pid, res in data["problem_results"].items():
                    total_score += res["score"]
                    total_time_ms += res["time_ms"]
                    p_res_list.append(res)

                rows.append({
                    "user_id": uid,
                    "username": data["username"],
                    "total_score": total_score,
                    "total_time_ms": total_time_ms,
                    "problem_results": p_res_list
                })

            # Эрэмбэлэх
            rows.sort(key=lambda x: (-x["total_score"], x["total_time_ms"]))
            for idx, r_row in enumerate(rows):
                r_row["rank"] = idx + 1

            # Redis-т standings-ийг цацах
            r_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
            r_redis.publish(f"contest_scoreboard:{contest.id}", json.dumps(rows))
            logger.info(f"Published contest scoreboard update for contest {contest.id}")

            # Багийн scoreboard шинэчлэн цацах
            _publish_contest_team_scoreboard(db, contest.id)

    except Exception as e:
        logger.exception(f"Error updating contest scoreboard in Celery: {e}")


def _publish_contest_team_scoreboard(db, contest_id: int):
    """Багийн live scoreboard-ийг тооцоолж Redis-ээр дамжуулах."""
    try:
        from app.models.contest import Contest, ContestProblem, ContestTeam, Team, TeamMember
        from app.models.submission import Submission, SubmissionStatus
        from app.models.user import User
        import redis, json

        contest = db.query(Contest).filter(Contest.id == contest_id).first()
        if not contest:
            return

        c_problems = db.query(ContestProblem).filter(ContestProblem.contest_id == contest_id).all()
        prob_ids = [cp.problem_id for cp in c_problems]
        prob_id_to_code = {cp.problem_id: cp.problem.code for cp in c_problems if cp.problem}
        prob_max_points = {cp.problem_id: cp.points for cp in c_problems}

        contest_teams = db.query(ContestTeam).filter(ContestTeam.contest_id == contest_id).all()
        BALLOON_HEX = ["#ef4444", "#10b981", "#06b6d4", "#f59e0b", "#8b5cf6"]

        rows = []
        for ct in contest_teams:
            team = ct.team
            if not team:
                continue
            member_ids = [m.user_id for m in team.members]

            m_usernames = []
            for m in team.members:
                user = db.query(User.username).filter(User.id == m.user_id).first()
                if user:
                    m_usernames.append(user[0])

            # Багийн гишүүдээс тэмцээний үед илгээсэн submissions
            subs = db.query(Submission).filter(
                Submission.submitted_at >= contest.start_time,
                Submission.submitted_at <= contest.end_time,
                Submission.problem_id.in_(prob_ids),
                Submission.user_id.in_(member_ids)
            ).order_by(Submission.submitted_at.asc()).all()

            prob_results = {pid: {"score": 0, "attempts": 0, "time_minutes": 0.0, "is_solved": False} for pid in prob_ids}
            for pid in prob_ids:
                p_subs = [s for s in subs if s.problem_id == pid]
                max_limit = prob_max_points[pid]
                for s in p_subs:
                    if prob_results[pid]["is_solved"]:
                        continue
                    prob_results[pid]["attempts"] += 1
                    sub_score = int((s.score / 100.0) * max_limit) if s.score else 0
                    if s.status == SubmissionStatus.ACCEPTED:
                        sub_score = max_limit
                    if sub_score > prob_results[pid]["score"]:
                        prob_results[pid]["score"] = sub_score
                        duration_mins = (s.submitted_at - contest.start_time).total_seconds() / 60.0
                        prob_results[pid]["time_minutes"] = round(duration_mins, 2)
                    if s.status == SubmissionStatus.ACCEPTED:
                        prob_results[pid]["is_solved"] = True

            solved_count = 0
            total_penalty = 0.0
            balloons = []
            p_res_list = []

            for idx, cp in enumerate(c_problems):
                pid = cp.problem_id
                res = prob_results[pid]
                if res["is_solved"]:
                    solved_count += 1
                    penalty = res["time_minutes"] + 20 * (res["attempts"] - 1)
                    total_penalty += penalty
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

        rows.sort(key=lambda x: (-x["solved_count"], x["total_penalty"]))
        for idx, r_row in enumerate(rows):
            r_row["rank"] = idx + 1

        r_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r_redis.publish(f"contest_team_scoreboard:{contest_id}", json.dumps(rows))
        logger.info(f"Published contest team scoreboard update for contest {contest_id}")

    except Exception as e:
        logger.exception(f"Error publishing contest team scoreboard in Celery: {e}")
