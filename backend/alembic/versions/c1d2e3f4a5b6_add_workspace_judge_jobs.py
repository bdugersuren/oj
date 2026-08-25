"""add persistent workspace judge jobs

Revision ID: c1d2e3f4a5b6
Revises: f0c1d2e3a4b5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "f0c1d2e3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_judge_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("problem_code", sa.String(length=30), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False, server_default="verify_solution"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="QUEUED"),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_log", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_workspace_judge_jobs_id", "workspace_judge_jobs", ["id"])
    op.create_index("ix_workspace_judge_jobs_user_id", "workspace_judge_jobs", ["user_id"])
    op.create_index("ix_workspace_judge_jobs_problem_code", "workspace_judge_jobs", ["problem_code"])
    op.create_index("ix_workspace_judge_jobs_status", "workspace_judge_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("workspace_judge_jobs")
