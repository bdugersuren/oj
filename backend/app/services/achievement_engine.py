import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.gamification import Achievement, UserAchievement
from app.models.progression import StudentProgress
from app.services.xp_engine import award_xp, notify_gamification_update

logger = logging.getLogger(__name__)

# Платформын суурь амжилтуудын нөхцөлүүд
ACHIEVEMENT_RULES = {
    "FIRST_AC": {
        "title": "Анхны алхам",
        "description": "Эхний бодлогоо амжилттай бодож дуусгалаа.",
        "icon": "🏅",
        "xp_bonus": 50,
        "check": lambda progress: progress.solved_count >= 1
    },
    "SOLVED_10": {
        "title": "Хүрэл бодогч",
        "description": "Нийт 10 бодлогыг амжилттай бодож дуусгалаа.",
        "icon": "🥉",
        "xp_bonus": 100,
        "check": lambda progress: progress.solved_count >= 10
    },
    "SOLVED_50": {
        "title": "Мөнгөн бодогч",
        "description": "Нийт 50 бодлогыг амжилттай бодож дуусгалаа.",
        "icon": "🥈",
        "xp_bonus": 250,
        "check": lambda progress: progress.solved_count >= 50
    },
    "STREAK_7": {
        "title": "Тууштай сурагч",
        "description": "7 өдөр дараалж бодлого бодож идэвхтэй байлаа.",
        "icon": "🔥",
        "xp_bonus": 150,
        "check": lambda progress: progress.highest_streak >= 7
    },
    "RATING_1300": {
        "title": "Дуэлийн аварга",
        "description": "Elo рейтингээ 1300-аас дээш гаргалаа.",
        "icon": "⚔️",
        "xp_bonus": 200,
        "check": lambda progress: progress.elo_rating >= 1300
    }
}

async def initialize_achievements(db: AsyncSession):
    """DB-д суурь амжилтууд бүртгэгдээгүй байвал үүсгэнэ."""
    for code, meta in ACHIEVEMENT_RULES.items():
        result = await db.execute(select(Achievement).where(Achievement.code == code))
        if not result.scalar_one_or_none():
            ach = Achievement(
                code=code,
                title=meta["title"],
                description=meta["description"],
                icon=meta["icon"],
                xp_bonus=meta["xp_bonus"],
                category="general"
            )
            db.add(ach)
    await db.commit()

async def check_achievements(db: AsyncSession, user_id: str):
    """Хэрэглэгчийн шинээр нээгдэх амжилтуудыг шалгана."""
    # Эхлээд суурь амжилтууд DB-д бэлэн байгаа эсэхийг баталгаажуулна
    await initialize_achievements(db)

    # Прогресс авах
    prog_res = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id == user_id)
    )
    progress = prog_res.scalar_one_or_none()
    if not progress:
        return

    # Сурагчийн аль хэдийн авсан амжилтуудыг авах
    owned_res = await db.execute(
        select(UserAchievement).where(UserAchievement.user_id == user_id)
    )
    owned_ach_ids = {ua.achievement_id for ua in owned_res.scalars().all()}

    # Бүх систем дэх амжилтууд
    all_ach_res = await db.execute(select(Achievement))
    all_achievements = all_ach_res.scalars().all()
    ach_map = {a.code: a for a in all_achievements}

    for code, meta in ACHIEVEMENT_RULES.items():
        ach = ach_map.get(code)
        if not ach:
            continue
        
        # Хэрэв өмнө нь аваагүй бөгөөд нөхцөл биелсэн бол
        if ach.id not in owned_ach_ids and meta["check"](progress):
            # Амжилт нээх
            ua = UserAchievement(
                user_id=user_id,
                achievement_id=ach.id
            )
            db.add(ua)
            await db.flush()
            logger.info(f"Achievement unlocked for user {user_id}: {ach.title}")

            # Баярын мэдээлэл болон XP урамшуулал илгээх
            await notify_gamification_update(str(user_id), {
                "event": "ACHIEVEMENT_UNLOCKED",
                "code": ach.code,
                "title": ach.title,
                "description": ach.description,
                "icon": ach.icon,
                "xp_bonus": ach.xp_bonus
            })

            # Bonus XP олгох
            await award_xp(db, user_id, ach.xp_bonus, f"Амжилт нээсний шагнал: {ach.title}")

    await db.commit()
