"""add judge output-limit and system-error statuses

Revision ID: f0c1d2e3a4b5
Revises: ea6cdd0baf65
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f0c1d2e3a4b5"
down_revision: Union[str, None] = "ea6cdd0baf65"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL enum values are committed independently and IF NOT EXISTS
    # keeps this migration safe across partially upgraded development DBs.
    op.execute("ALTER TYPE submissionstatus ADD VALUE IF NOT EXISTS 'OUTPUT_LIMIT'")
    op.execute("ALTER TYPE submissionstatus ADD VALUE IF NOT EXISTS 'SYSTEM_ERROR'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values safely while rows may
    # reference them. A downgrade therefore intentionally preserves values.
    pass
