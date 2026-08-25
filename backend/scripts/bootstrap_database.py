"""Create or migrate the database without guessing an unknown legacy state.

The repository's oldest Alembic revision converts an already-existing integer-ID
schema and therefore cannot build a completely empty database. For a fresh
installation we create the current SQLAlchemy schema and stamp it at Alembic
head. Existing versioned installations continue through normal Alembic upgrade.
An unversioned, non-empty database is rejected to avoid silently skipping data
conversions.
"""

import asyncio
import sys
from pathlib import Path

# Running ``python scripts/bootstrap_database.py`` places ``scripts`` rather
# than the project root on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401 - register all model metadata
from app.core.config import settings
from app.core.database import Base


async def inspect_database() -> tuple[set[str], bool]:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as connection:
            table_names = set(
                await connection.run_sync(lambda conn: inspect(conn).get_table_names())
            )
        return table_names, "alembic_version" in table_names
    finally:
        await engine.dispose()


async def create_fresh_schema() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()


def alembic_config() -> Config:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    return config


async def prepare_database() -> str:
    tables, versioned = await inspect_database()
    application_tables = tables - {"alembic_version"}

    if not application_tables:
        await create_fresh_schema()
        return "stamp"

    if not versioned:
        raise RuntimeError(
            "Refusing to stamp a non-empty unversioned database. "
            "Back it up and perform an explicit legacy-schema migration."
        )

    return "upgrade"


if __name__ == "__main__":
    action = asyncio.run(prepare_database())
    if action == "stamp":
        command.stamp(alembic_config(), "head")
        print("Fresh database created from current metadata and stamped at Alembic head.")
    else:
        command.upgrade(alembic_config(), "head")
        print("Existing versioned database upgraded to Alembic head.")
