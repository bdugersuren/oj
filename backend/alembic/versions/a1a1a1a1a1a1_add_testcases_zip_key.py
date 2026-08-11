"""add_testcases_zip_key

Revision ID: a1a1a1a1a1a1
Revises: 951896d9dfcd
Create Date: 2026-08-10 11:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1a1a1a1a1a1'
down_revision: Union[str, None] = '951896d9dfcd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('problems', sa.Column('testcases_zip_key', sa.String(length=500), nullable=True))
    op.alter_column('test_cases', 'input_data', existing_type=sa.Text(), nullable=True)
    op.alter_column('test_cases', 'output_data', existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column('test_cases', 'output_data', existing_type=sa.Text(), nullable=False)
    op.alter_column('test_cases', 'input_data', existing_type=sa.Text(), nullable=False)
    op.drop_column('problems', 'testcases_zip_key')
