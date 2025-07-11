"""Add personalization models for tag-based recommendation system

Revision ID: 003_add_personalization
Revises: 002_seed_data
Create Date: 2025-07-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003_add_personalization'
down_revision = '002_seed_data'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add personalization models and update existing models."""
    
    # Create tags table
    op.create_table('tags',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('category', sa.String(20), nullable=False),
        sa.Column('value', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.CheckConstraint("category IN ('style', 'format', 'topic', 'tone')", name='check_tag_category')
    )
    
    # Create indexes for tags table
    op.create_index('idx_tag_category_value', 'tags', ['category', 'value'])
    op.create_index(op.f('ix_tags_category'), 'tags', ['category'])
    op.create_index(op.f('ix_tags_name'), 'tags', ['name'])

    # Create joke_tags association table
    op.create_table('joke_tags',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('joke_id', sa.String(36), nullable=False),
        sa.Column('tag_id', sa.String(36), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True, default=1.0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['joke_id'], ['jokes.id'], ),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('confidence >= 0 AND confidence <= 1', name='check_confidence_bounds')
    )
    
    # Create indexes for joke_tags table
    op.create_index('idx_joke_tag_unique', 'joke_tags', ['joke_id', 'tag_id'], unique=True)
    op.create_index('idx_joke_tags_joke', 'joke_tags', ['joke_id'])
    op.create_index('idx_joke_tags_tag', 'joke_tags', ['tag_id'])

    # Create user_tag_scores table
    op.create_table('user_tag_scores',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('tag_id', sa.String(36), nullable=False),
        sa.Column('score', sa.Float(), nullable=True, default=0.0),
        sa.Column('interaction_count', sa.Integer(), nullable=True, default=0),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('score >= -1 AND score <= 1', name='check_score_bounds'),
        sa.CheckConstraint('interaction_count >= 0', name='check_interaction_count_positive')
    )
    
    # Create indexes for user_tag_scores table
    op.create_index('idx_user_tag_score_unique', 'user_tag_scores', ['user_id', 'tag_id'], unique=True)
    op.create_index('idx_user_tag_scores_user', 'user_tag_scores', ['user_id'])
    op.create_index('idx_user_tag_scores_tag', 'user_tag_scores', ['tag_id'])
    op.create_index('idx_user_tag_scores_score', 'user_tag_scores', ['score'])

    # Create personalization_metrics table
    op.create_table('personalization_metrics',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("metric_type IN ('click_through_rate', 'avg_rating', 'exploration_rate', 'diversity_score')", name='check_metric_type')
    )
    
    # Create indexes for personalization_metrics table
    op.create_index('idx_personalization_metrics_user_type', 'personalization_metrics', ['user_id', 'metric_type'])
    op.create_index('idx_personalization_metrics_period', 'personalization_metrics', ['period_start', 'period_end'])


def downgrade() -> None:
    """Remove personalization models."""
    
    # Drop indexes first
    op.drop_index('idx_personalization_metrics_period', table_name='personalization_metrics')
    op.drop_index('idx_personalization_metrics_user_type', table_name='personalization_metrics')
    op.drop_index('idx_user_tag_scores_score', table_name='user_tag_scores')
    op.drop_index('idx_user_tag_scores_tag', table_name='user_tag_scores')
    op.drop_index('idx_user_tag_scores_user', table_name='user_tag_scores')
    op.drop_index('idx_user_tag_score_unique', table_name='user_tag_scores')
    op.drop_index('idx_joke_tags_tag', table_name='joke_tags')
    op.drop_index('idx_joke_tags_joke', table_name='joke_tags')
    op.drop_index('idx_joke_tag_unique', table_name='joke_tags')
    op.drop_index(op.f('ix_tags_name'), table_name='tags')
    op.drop_index(op.f('ix_tags_category'), table_name='tags')
    op.drop_index('idx_tag_category_value', table_name='tags')
    
    # Drop tables
    op.drop_table('personalization_metrics')
    op.drop_table('user_tag_scores')
    op.drop_table('joke_tags')
    op.drop_table('tags')