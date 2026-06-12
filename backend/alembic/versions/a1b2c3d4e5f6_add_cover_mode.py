"""add cover_mode column

Revision ID: a1b2c3d4e5f6
Revises: 51b589039aed
Create Date: 2026-06-12 07:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '51b589039aed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('articles', sa.Column('cover_mode', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('articles', 'cover_mode')
