import logging
from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json
import redis.asyncio as aioredis

from app.core.config import settings
from app.models.progression import StudentProgress, StudentLevel
from app.models.submission import Submission

logger = logging.getLogger(__name__)

async def notify_gamification_update(user_id: str, payload: dict):
    """Redis Pub/Sub ашиглан frontend-д бодит цагийн геймификацийн мэдээлэл илгээнэ."""
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        # Сурагчийн хувийн сувгаар broadcast хийнэ
        await r.publish(f"user_progress:{user_id}", json.dumps(payload))
        await r.close()
    except Exception as e:
        logger.warning(f"Failed to publish gamification update to Redis: {e}")

async def award_xp(db: AsyncSession, user_id: str, amount: int, reason: str) -> int:
    """Сурагчид XP олгох ба түвшин ахисан эсэхийг шалгана."""
    if amount <= 0:
        return 0

    result = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id == user_id)
    )
    progress = result.scalar_one_or_none()
    if not progress:
        return 0

    old_xp = progress.total_xp
    progress.total_xp += amount
    logger.info(f"User {user_id} awarded {amount} XP for: {reason}. Total XP: {progress.total_xp}")
    
    # Түвшин ахисан эсэхийг шалгах
    level_upgraded, old_lvl, new_lvl = await check_level_up(db, progress)
    
    await db.commit()

    # WebSocket-ээр мэдэгдэл илгээх
    payload = {
        "event": "XP_AWARDED",
        "amount": amount,
        "reason": reason,
        "total_xp": progress.total_xp,
        "level_upgraded": level_upgraded
    }
    if level_upgraded:
        payload["old_level"] = old_lvl
        payload["new_level"] = new_lvl

    await notify_gamification_update(str(user_id), payload)
    return amount

async def check_level_up(db: AsyncSession, progress: StudentProgress) -> tuple[bool, str, str]:
    """Хэрэглэгчийн одоогийн оноонд тохирох түвшинг шалгаж шинэчилнэ."""
    # Бүх түвшингүүдийг ачаалах (XP болон Solved count шаардлагаар шүүнэ)
    lvl_result = await db.execute(
        select(StudentLevel).order_by(StudentLevel.order.desc())
    )
    levels = lvl_result.scalars().all()

    suitable_level = None
    for lvl in levels:
        # Дараах болзлыг хангаж буй хамгийн өндөр түвшинг олно
        if progress.total_xp >= lvl.min_xp and progress.solved_count >= lvl.required_solved:
            suitable_level = lvl
            break

    # Хэрэв тохирох түвшин олдсон бөгөөд одоогийнхоос өөр байвал ахиулна
    if suitable_level and suitable_level.id != progress.current_level_id:
        # Одоогийн түвшний нэрийг авах
        cur_lvl_result = await db.execute(select(StudentLevel).where(StudentLevel.id == progress.current_level_id))
        cur_lvl = cur_lvl_result.scalar_one_or_none()
        old_name = cur_lvl.name if cur_lvl else "Bronze"

        progress.current_level_id = suitable_level.id
        logger.info(f"User {progress.user_id} leveled up to {suitable_level.name}")
        return True, old_name, suitable_level.name

    return False, "", ""

async def update_streak(db: AsyncSession, user_id: str) -> int:
    """Сурагчийн өдөр бүрийн streak болон идэвхийг шинэчилнэ."""
    result = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id == user_id)
    )
    progress = result.scalar_one_or_none()
    if not progress:
        return 0

    today = date.today()
    last_active = progress.last_active_date.date() if progress.last_active_date else None

    if not last_active:
        progress.current_streak = 1
    else:
        delta = (today - last_active).days
        if delta == 1:
            # Дараалсан дараагийн өдөр бол нэмнэ
            progress.current_streak += 1
        elif delta > 1:
            # Тасарсан бол дахин 1-ээс эхлүүлнэ
            progress.current_streak = 1
        # Хэрэв өнөөдөр аль хэдийн бодлого бодсон (delta == 0) бол streak өөрчлөгдөхгүй

    # Хамгийн дээд streak-ийг шинэчлэх
    if progress.current_streak > progress.highest_streak:
        progress.highest_streak = progress.current_streak

    progress.last_active_date = datetime.utcnow()
    await db.commit()

    # Идэвхтэй streak-ийн мэдээллийг илгээх
    await notify_gamification_update(str(user_id), {
        "event": "STREAK_UPDATED",
        "current_streak": progress.current_streak,
        "highest_streak": progress.highest_streak
    })

    return progress.current_streak
