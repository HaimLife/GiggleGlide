"""Add AI generation fields

Revision ID: 005
Revises: 004
Create Date: 2024-01-10

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    """Add AI generation tracking fields."""
    
    # Add AI usage tracking table
    op.create_table(
        'ai_usage_tracking',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), nullable=True),
        sa.Column('generation_id', sa.String(36), nullable=False),
        sa.Column('model', sa.String(50), nullable=False),
        sa.Column('prompt_tokens', sa.Integer, default=0),
        sa.Column('completion_tokens', sa.Integer, default=0),
        sa.Column('total_tokens', sa.Integer, default=0),
        sa.Column('estimated_cost', sa.Float, default=0.0),
        sa.Column('jokes_generated', sa.Integer, default=0),
        sa.Column('jokes_stored', sa.Integer, default=0),
        sa.Column('jokes_moderated', sa.Integer, default=0),
        sa.Column('jokes_flagged', sa.Integer, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Index('idx_ai_usage_user', 'user_id'),
        sa.Index('idx_ai_usage_created', 'created_at'),
        sa.Index('idx_ai_usage_generation', 'generation_id')
    )
    
    # Add moderation results table
    op.create_table(
        'moderation_results',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('joke_id', sa.String(36), sa.ForeignKey('jokes.id'), nullable=False),
        sa.Column('safe', sa.Boolean, default=True),
        sa.Column('violence_score', sa.Float, default=0.0),
        sa.Column('hate_score', sa.Float, default=0.0),
        sa.Column('self_harm_score', sa.Float, default=0.0),
        sa.Column('sexual_score', sa.Float, default=0.0),
        sa.Column('flagged_categories', sa.JSON, nullable=True),
        sa.Column('moderation_model', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Index('idx_moderation_joke', 'joke_id'),
        sa.Index('idx_moderation_safe', 'safe')
    )
    
    # Add cost tracking table
    op.create_table(
        'ai_cost_tracking',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('date', sa.Date, nullable=False, unique=True),
        sa.Column('daily_cost', sa.Float, default=0.0),
        sa.Column('daily_requests', sa.Integer, default=0),
        sa.Column('daily_tokens', sa.Integer, default=0),
        sa.Column('monthly_cost_to_date', sa.Float, default=0.0),
        sa.Column('monthly_requests_to_date', sa.Integer, default=0),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Index('idx_cost_tracking_date', 'date')
    )
    
    print("Created AI tracking tables")


def downgrade():
    """Remove AI generation tracking fields."""
    op.drop_table('ai_cost_tracking')
    op.drop_table('moderation_results')
    op.drop_table('ai_usage_tracking')
    print("Dropped AI tracking tables")