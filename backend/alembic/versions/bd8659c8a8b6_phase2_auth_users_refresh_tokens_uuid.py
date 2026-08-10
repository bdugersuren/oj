"""Phase 2: Auth — users UUID + new columns + refresh_tokens

Revision ID: bd8659c8a8b6
Revises:
Create Date: 2026-08-08
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = 'bd8659c8a8b6'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 0. Enable uuid-ossp extension
    conn.execute(sa.text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))

    # 1. Drop all FK constraints referencing users.id
    fk_drops = [
        ("student_progress",    "student_progress_user_id_fkey"),
        ("submissions",         "submissions_user_id_fkey"),
        ("user_achievements",   "user_achievements_user_id_fkey"),
        ("user_lesson_progress","user_lesson_progress_user_id_fkey"),
        ("classroom_students",  "classroom_students_student_id_fkey"),
        ("classrooms",          "classrooms_teacher_id_fkey"),
        ("tickets",             "tickets_student_id_fkey"),
        ("tickets",             "tickets_teacher_id_fkey"),
        ("ticket_messages",     "ticket_messages_sender_id_fkey"),
    ]
    for table, constraint in fk_drops:
        conn.execute(sa.text(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS "{constraint}"'))

    # 2. Add UUID column to users
    conn.execute(sa.text('ALTER TABLE users ADD COLUMN new_id UUID DEFAULT uuid_generate_v4()'))
    conn.execute(sa.text('UPDATE users SET new_id = uuid_generate_v4()'))

    # 3. Add + populate temp UUID FK columns in dependent tables
    deps = [
        ("student_progress",    "user_id",    "new_user_id"),
        ("submissions",         "user_id",    "new_user_id"),
        ("user_achievements",   "user_id",    "new_user_id"),
        ("user_lesson_progress","user_id",    "new_user_id"),
    ]
    for table, old_col, new_col in deps:
        conn.execute(sa.text(f'ALTER TABLE {table} ADD COLUMN {new_col} UUID'))
        conn.execute(sa.text(f'''
            UPDATE {table} t SET {new_col} = u.new_id
            FROM users u WHERE u.id = t.{old_col}
        '''))

    # classroom_students
    conn.execute(sa.text('ALTER TABLE classroom_students ADD COLUMN new_student_id UUID'))
    conn.execute(sa.text('''
        UPDATE classroom_students cs SET new_student_id = u.new_id
        FROM users u WHERE u.id = cs.student_id
    '''))
    # classrooms
    conn.execute(sa.text('ALTER TABLE classrooms ADD COLUMN new_teacher_id UUID'))
    conn.execute(sa.text('''
        UPDATE classrooms c SET new_teacher_id = u.new_id
        FROM users u WHERE u.id = c.teacher_id
    '''))
    # tickets
    conn.execute(sa.text('ALTER TABLE tickets ADD COLUMN new_student_id UUID'))
    conn.execute(sa.text('ALTER TABLE tickets ADD COLUMN new_teacher_id UUID'))
    conn.execute(sa.text('''
        UPDATE tickets t SET new_student_id = u.new_id
        FROM users u WHERE u.id = t.student_id
    '''))
    conn.execute(sa.text('''
        UPDATE tickets t SET new_teacher_id = u.new_id
        FROM users u WHERE u.id = t.teacher_id
    '''))
    # ticket_messages
    conn.execute(sa.text('ALTER TABLE ticket_messages ADD COLUMN new_sender_id UUID'))
    conn.execute(sa.text('''
        UPDATE ticket_messages tm SET new_sender_id = u.new_id
        FROM users u WHERE u.id = tm.sender_id
    '''))

    # 4. Drop old PK on users, rename new_id -> id
    conn.execute(sa.text('ALTER TABLE users DROP CONSTRAINT users_pkey'))
    conn.execute(sa.text('DROP INDEX IF EXISTS ix_users_id'))
    conn.execute(sa.text('ALTER TABLE users DROP COLUMN id'))
    conn.execute(sa.text('ALTER TABLE users RENAME COLUMN new_id TO id'))
    conn.execute(sa.text('ALTER TABLE users ADD PRIMARY KEY (id)'))
    conn.execute(sa.text('DROP SEQUENCE IF EXISTS users_id_seq'))

    # 5. Swap FK columns in dependent tables
    simple_swaps = [
        ("student_progress",    "user_id",   "new_user_id",   True),
        ("submissions",         "user_id",   "new_user_id",   True),
        ("user_achievements",   "user_id",   "new_user_id",   True),
        ("user_lesson_progress","user_id",   "new_user_id",   True),
    ]
    for table, old_col, new_col, not_null in simple_swaps:
        conn.execute(sa.text(f'ALTER TABLE {table} DROP COLUMN {old_col}'))
        conn.execute(sa.text(f'ALTER TABLE {table} RENAME COLUMN {new_col} TO {old_col}'))
        if not_null:
            conn.execute(sa.text(f'ALTER TABLE {table} ALTER COLUMN {old_col} SET NOT NULL'))

    conn.execute(sa.text('ALTER TABLE classroom_students DROP COLUMN student_id'))
    conn.execute(sa.text('ALTER TABLE classroom_students RENAME COLUMN new_student_id TO student_id'))
    conn.execute(sa.text('ALTER TABLE classroom_students ALTER COLUMN student_id SET NOT NULL'))

    conn.execute(sa.text('ALTER TABLE classrooms DROP COLUMN teacher_id'))
    conn.execute(sa.text('ALTER TABLE classrooms RENAME COLUMN new_teacher_id TO teacher_id'))
    conn.execute(sa.text('ALTER TABLE classrooms ALTER COLUMN teacher_id SET NOT NULL'))

    conn.execute(sa.text('ALTER TABLE tickets DROP COLUMN student_id'))
    conn.execute(sa.text('ALTER TABLE tickets RENAME COLUMN new_student_id TO student_id'))
    conn.execute(sa.text('ALTER TABLE tickets ALTER COLUMN student_id SET NOT NULL'))
    conn.execute(sa.text('ALTER TABLE tickets DROP COLUMN teacher_id'))
    conn.execute(sa.text('ALTER TABLE tickets RENAME COLUMN new_teacher_id TO teacher_id'))

    conn.execute(sa.text('ALTER TABLE ticket_messages DROP COLUMN sender_id'))
    conn.execute(sa.text('ALTER TABLE ticket_messages RENAME COLUMN new_sender_id TO sender_id'))
    conn.execute(sa.text('ALTER TABLE ticket_messages ALTER COLUMN sender_id SET NOT NULL'))

    # 6. Recreate FK constraints
    fk_creates = [
        ("student_progress",    "student_progress_user_id_fkey",    "user_id",    "users(id)", "CASCADE"),
        ("submissions",         "submissions_user_id_fkey",          "user_id",    "users(id)", "CASCADE"),
        ("user_achievements",   "user_achievements_user_id_fkey",   "user_id",    "users(id)", "CASCADE"),
        ("user_lesson_progress","user_lesson_progress_user_id_fkey","user_id",    "users(id)", "CASCADE"),
        ("classroom_students",  "classroom_students_student_id_fkey","student_id","users(id)", "CASCADE"),
        ("classrooms",          "classrooms_teacher_id_fkey",       "teacher_id", "users(id)", "CASCADE"),
        ("tickets",             "tickets_student_id_fkey",          "student_id", "users(id)", "CASCADE"),
        ("ticket_messages",     "ticket_messages_sender_id_fkey",   "sender_id",  "users(id)", "CASCADE"),
    ]
    for table, name, col, ref, action in fk_creates:
        conn.execute(sa.text(f'''
            ALTER TABLE {table} ADD CONSTRAINT {name}
            FOREIGN KEY ({col}) REFERENCES {ref} ON DELETE {action}
        '''))
    # tickets.teacher_id — SET NULL on delete
    conn.execute(sa.text('''
        ALTER TABLE tickets ADD CONSTRAINT tickets_teacher_id_fkey
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
    '''))

    # 7. New profile columns on users
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(150)"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS school VARCHAR(200)"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS grade VARCHAR(50)"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE"))
    conn.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP"))
    conn.execute(sa.text("ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255)"))
    conn.execute(sa.text("ALTER TABLE users ALTER COLUMN avatar_url TYPE VARCHAR(500)"))

    # 8. Create refresh_tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id',          PGUUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('user_id',     PGUUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token',       sa.String(512), nullable=False, unique=True),
        sa.Column('expires_at',  sa.DateTime, nullable=False),
        sa.Column('is_revoked',  sa.Boolean, nullable=False, server_default='false'),
        sa.Column('device_info', sa.String(255), nullable=True),
        sa.Column('created_at',  sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('ix_refresh_tokens_token',   'refresh_tokens', ['token'],   unique=True)
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'], unique=False)

    # 9. Rebuild users indexes
    conn.execute(sa.text('CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email    ON users(email)'))
    conn.execute(sa.text('CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users(username)'))
    conn.execute(sa.text('CREATE INDEX        IF NOT EXISTS ix_users_id       ON users(id)'))


def downgrade() -> None:
    raise NotImplementedError(
        "UUID migration downgrade is not supported. Use a fresh database instead."
    )
