"""Initial migration

Revision ID: 001
Revises: 
Create Date: 2025-07-11 17:50:38

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('preferred_language', sa.String(length=5), nullable=True),
        sa.Column('dark_mode', sa.Boolean(), nullable=True),
        sa.Column('notifications_enabled', sa.Boolean(), nullable=True),
        sa.Column('notification_time', sa.String(length=5), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # Create categories table
    op.create_table('categories',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('joke_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # Create jokes table
    op.create_table('jokes',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('language', sa.String(length=5), nullable=True),
        sa.Column('rating', sa.Float(), nullable=True),
        sa.Column('view_count', sa.Integer(), nullable=True),
        sa.Column('like_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('external_id', sa.String(length=100), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.CheckConstraint('like_count >= 0', name='check_like_count_positive'),
        sa.CheckConstraint('rating >= 0 AND rating <= 5', name='check_rating_bounds'),
        sa.CheckConstraint('view_count >= 0', name='check_view_count_positive'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id')
    )
    op.create_index('idx_joke_category_language', 'jokes', ['category', 'language'], unique=False)
    op.create_index('idx_joke_created', 'jokes', ['created_at'], unique=False)
    op.create_index('idx_joke_rating', 'jokes', ['rating'], unique=False)
    op.create_index(op.f('ix_jokes_category'), 'jokes', ['category'], unique=False)
    op.create_index(op.f('ix_jokes_language'), 'jokes', ['language'], unique=False)

    # Create user_stats table
    op.create_table('user_stats',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('jokes_viewed', sa.Integer(), nullable=True),
        sa.Column('jokes_liked', sa.Integer(), nullable=True),
        sa.Column('jokes_skipped', sa.Integer(), nullable=True),
        sa.Column('favorite_category', sa.String(length=50), nullable=True),
        sa.Column('last_active', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('jokes_liked >= 0', name='check_jokes_liked_positive'),
        sa.CheckConstraint('jokes_skipped >= 0', name='check_jokes_skipped_positive'),
        sa.CheckConstraint('jokes_viewed >= 0', name='check_jokes_viewed_positive'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )

    # Create favorites table
    op.create_table('favorites',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('joke_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['joke_id'], ['jokes.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_favorite_user_joke', 'favorites', ['user_id', 'joke_id'], unique=True)

    # Create joke_interactions table
    op.create_table('joke_interactions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('joke_id', sa.String(length=36), nullable=False),
        sa.Column('interaction_type', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.CheckConstraint("interaction_type IN ('view', 'like', 'skip')", name='check_interaction_type'),
        sa.ForeignKeyConstraint(['joke_id'], ['jokes.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_interaction_created', 'joke_interactions', ['created_at'], unique=False)
    op.create_index('idx_interaction_user_created', 'joke_interactions', ['user_id', 'created_at'], unique=False)
    op.create_index('idx_interaction_user_joke_type', 'joke_interactions', ['user_id', 'joke_id', 'interaction_type'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order of creation
    op.drop_index('idx_interaction_user_joke_type', table_name='joke_interactions')
    op.drop_index('idx_interaction_user_created', table_name='joke_interactions')
    op.drop_index('idx_interaction_created', table_name='joke_interactions')
    op.drop_table('joke_interactions')
    
    op.drop_index('idx_favorite_user_joke', table_name='favorites')
    op.drop_table('favorites')
    
    op.drop_table('user_stats')
    
    op.drop_index(op.f('ix_jokes_language'), table_name='jokes')
    op.drop_index(op.f('ix_jokes_category'), table_name='jokes')
    op.drop_index('idx_joke_rating', table_name='jokes')
    op.drop_index('idx_joke_created', table_name='jokes')
    op.drop_index('idx_joke_category_language', table_name='jokes')
    op.drop_table('jokes')
    
    op.drop_table('categories')
    
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')