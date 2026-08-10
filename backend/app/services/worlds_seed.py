import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.gamification import World, Stage, StageProblem
from app.models.problem import Problem

logger = logging.getLogger(__name__)

async def initialize_worlds_and_stages(db: AsyncSession):
    """DB-д суурь суралцах ертөнц (Worlds) болон шатуудыг (Stages) автоматаар үүсгэнэ."""
    # 1. World 1: Үндсэн алгоритм (required_level_id = 1)
    world1_res = await db.execute(select(World).where(World.slug == "world-1-basics"))
    world1 = world1_res.scalar_one_or_none()
    if not world1:
        world1 = World(
            slug="world-1-basics",
            title="Алгоритмын Үндэс",
            description="Програмчлалын суурь ухагдахуун болон хялбар алгоритмууд",
            order=1,
            required_level_id=1
        )
        db.add(world1)
        await db.flush()
        logger.info("World 1 created.")

    # 2. Stage-үүд үүсгэх
    stage1_res = await db.execute(select(Stage).where(Stage.slug == "stage-1-intro"))
    stage1 = stage1_res.scalar_one_or_none()
    if not stage1:
        stage1 = Stage(
            world_id=world1.id,
            slug="stage-1-intro",
            title="Эхлэл алгоритм",
            description="Оролт гаралт, энгийн үйлдлүүд",
            order=1
        )
        db.add(stage1)
        await db.flush()
        logger.info("Stage 1 created.")

        # Энэ шатанд 'BF101' бодлогыг холбох
        p_res = await db.execute(select(Problem).where(Problem.code == "BF101"))
        prob = p_res.scalar_one_or_none()
        if prob:
            sp = StageProblem(
                stage_id=stage1.id,
                problem_id=prob.id,
                is_required=True,
                order=1
            )
            db.add(sp)
            logger.info("BF101 problem linked to Stage 1.")

    stage2_res = await db.execute(select(Stage).where(Stage.slug == "stage-2-conditionals"))
    stage2 = stage2_res.scalar_one_or_none()
    if not stage2:
        stage2 = Stage(
            world_id=world1.id,
            slug="stage-2-conditionals",
            title="Нөхцөл шалгах оператор",
            description="If/Else салбарлалттай ажиллах",
            order=2
        )
        db.add(stage2)
        await db.flush()
        logger.info("Stage 2 created.")

    await db.commit()
