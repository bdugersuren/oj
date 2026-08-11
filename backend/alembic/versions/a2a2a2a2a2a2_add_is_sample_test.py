"""add_is_sample_test

Revision ID: a2a2a2a2a2a2
Revises: a1a1a1a1a1a1
Create Date: 2026-08-10 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2a2a2a2a2a2'
down_revision: Union[str, None] = 'a1a1a1a1a1a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('submissions', sa.Column('is_sample_test', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('submissions', 'is_sample_test')
