"""Add published manifest dependency declarations.

Revision ID: eb417a2d8c91
Revises: f276d42efaa0
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "eb417a2d8c91"
down_revision = "f276d42efaa0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "dependencymanifestsnapshot",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository", sa.String(), nullable=False),
        sa.Column("ref", sa.String(), nullable=False),
        sa.Column("commit", sa.String(), nullable=False),
        sa.Column("parser_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("digest", sa.String(), nullable=False),
        sa.Column("manifest", postgresql.JSONB(), nullable=False),
        sa.Column("diagnostics", postgresql.JSONB(), nullable=False),
    )
    op.create_index(
        "dependency_snapshot_identity",
        "dependencymanifestsnapshot",
        ["repository", "ref", "commit", "parser_version"],
        unique=True,
    )
    op.create_table(
        "dependencyrefstate",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository", sa.String(), nullable=False),
        sa.Column("ref", sa.String(), nullable=False),
        sa.Column("app_id", sa.String(), nullable=False),
        sa.Column("observed_commit", sa.String(), nullable=False),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column(
            "snapshot_id", sa.Integer(), sa.ForeignKey("dependencymanifestsnapshot.id")
        ),
        sa.Column("last_attempt_at", sa.DateTime()),
        sa.Column("last_success_at", sa.DateTime()),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error", sa.String()),
        sa.CheckConstraint(
            "status IN ('pending', 'complete', 'partial', 'missing', 'error')",
            name="dependency_ref_status",
        ),
    )
    op.create_index(
        "dependency_ref_identity",
        "dependencyrefstate",
        ["repository", "ref"],
        unique=True,
    )
    op.create_table(
        "dependencydeclaration",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "snapshot_id",
            sa.Integer(),
            sa.ForeignKey("dependencymanifestsnapshot.id"),
            nullable=False,
        ),
        sa.Column("pointer", sa.String(), nullable=False),
        sa.Column("module_path", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("name_key", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("source_url", sa.String()),
        sa.Column("source_key", sa.String()),
        sa.Column("evidence", postgresql.JSONB(), nullable=False),
    )
    op.create_index(
        "ix_dependencydeclaration_snapshot_id", "dependencydeclaration", ["snapshot_id"]
    )
    op.create_index(
        "dependency_module_prefix",
        "dependencydeclaration",
        ["name_key"],
        postgresql_ops={"name_key": "text_pattern_ops"},
    )
    op.create_index("dependency_source_key", "dependencydeclaration", ["source_key"])
    op.create_index(
        "dependency_declaration_pointer",
        "dependencydeclaration",
        ["snapshot_id", "pointer"],
        unique=True,
    )


def downgrade():
    op.drop_table("dependencydeclaration")
    op.drop_table("dependencyrefstate")
    op.drop_table("dependencymanifestsnapshot")
