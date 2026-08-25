"""add judge leases and reward idempotency fields

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column("judge_attempt", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("submissions", sa.Column("judge_lease_expires_at", sa.DateTime(), nullable=True))
    op.add_column("submissions", sa.Column("judge_started_at", sa.DateTime(), nullable=True))
    op.add_column("submissions", sa.Column("judge_finished_at", sa.DateTime(), nullable=True))
    op.add_column("submissions", sa.Column("rewards_applied_at", sa.DateTime(), nullable=True))
    op.add_column(
        "workspace_judge_jobs",
        sa.Column("judge_attempt", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "workspace_judge_jobs",
        sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspace_judge_jobs", "lease_expires_at")
    op.drop_column("workspace_judge_jobs", "judge_attempt")
    op.drop_column("submissions", "rewards_applied_at")
    op.drop_column("submissions", "judge_finished_at")
    op.drop_column("submissions", "judge_started_at")
    op.drop_column("submissions", "judge_lease_expires_at")
    op.drop_column("submissions", "judge_attempt")
