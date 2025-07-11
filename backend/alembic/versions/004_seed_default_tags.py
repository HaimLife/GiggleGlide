"""Seed default tags for personalization system

Revision ID: 004_seed_default_tags
Revises: 003_add_personalization
Create Date: 2025-07-11 12:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
import uuid
from datetime import datetime

# revision identifiers, used by Alembic.
revision = '004_seed_default_tags'
down_revision = '003_add_personalization'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Seed default tags for the personalization system."""
    
    # Define the tags table for bulk insert
    tags_table = table('tags',
        column('id', sa.String),
        column('name', sa.String),
        column('category', sa.String),
        column('value', sa.String),
        column('description', sa.String),
        column('created_at', sa.DateTime)
    )
    
    # Style tags
    style_tags = [
        ('Observational', 'observational', 'Observational comedy style'),
        ('Absurd', 'absurd', 'Absurd or surreal humor style'),
        ('Wordplay', 'wordplay', 'Puns and word-based humor'),
        ('Sarcastic', 'sarcastic', 'Sarcastic or ironic humor'),
        ('Physical', 'physical', 'Physical comedy and slapstick'),
        ('Storytelling', 'storytelling', 'Narrative-based humor'),
        ('One Liner', 'one_liner', 'Short, punchy jokes'),
        ('Prop Comedy', 'prop_comedy', 'Comedy using props or visual elements'),
        ('Impressions', 'impressions', 'Mimicry and character impressions'),
        ('Self Deprecating', 'self_deprecating', 'Self-deprecating humor')
    ]
    
    # Format tags
    format_tags = [
        ('Question Answer', 'question_answer', 'Q&A format jokes'),
        ('Setup Punchline', 'setup_punchline', 'Traditional setup and punchline'),
        ('List', 'list', 'List-based humor'),
        ('Dialogue', 'dialogue', 'Conversation-based jokes'),
        ('Narrative', 'narrative', 'Story-format jokes'),
        ('Riddle', 'riddle', 'Riddle-format humor'),
        ('Knock Knock', 'knock_knock', 'Knock-knock jokes'),
        ('Meme', 'meme', 'Meme-style humor'),
        ('Quote', 'quote', 'Quotable one-liners'),
        ('Comparison', 'comparison', 'Comparison-based humor')
    ]
    
    # Topic tags
    topic_tags = [
        ('Relationships', 'relationships', 'Dating, marriage, and relationships'),
        ('Work', 'work', 'Office and workplace humor'),
        ('Technology', 'technology', 'Tech and digital life'),
        ('Food', 'food', 'Food and cooking humor'),
        ('Animals', 'animals', 'Pet and animal jokes'),
        ('Travel', 'travel', 'Travel and vacation humor'),
        ('Family', 'family', 'Family life and relatives'),
        ('Sports', 'sports', 'Sports and fitness humor'),
        ('Politics', 'politics', 'Political and current events'),
        ('Science', 'science', 'Science and education'),
        ('Celebrities', 'celebrities', 'Celebrity and pop culture'),
        ('Movies Tv', 'movies_tv', 'Entertainment and media'),
        ('Music', 'music', 'Music and musicians'),
        ('Health', 'health', 'Health and medical humor'),
        ('Money', 'money', 'Finance and money jokes'),
        ('School', 'school', 'Education and school life'),
        ('Weather', 'weather', 'Weather and seasons'),
        ('Holidays', 'holidays', 'Holiday and celebration humor'),
        ('Aging', 'aging', 'Age and getting older'),
        ('Parenting', 'parenting', 'Parenting and children')
    ]
    
    # Tone tags
    tone_tags = [
        ('Lighthearted', 'lighthearted', 'Light and cheerful mood'),
        ('Witty', 'witty', 'Clever and sharp humor'),
        ('Silly', 'silly', 'Playful and nonsensical'),
        ('Clever', 'clever', 'Intelligent and sophisticated'),
        ('Dark', 'dark', 'Dark or black humor'),
        ('Wholesome', 'wholesome', 'Clean and family-friendly'),
        ('Edgy', 'edgy', 'Provocative and boundary-pushing'),
        ('Nostalgic', 'nostalgic', 'Nostalgic and reminiscent'),
        ('Optimistic', 'optimistic', 'Positive and upbeat'),
        ('Cynical', 'cynical', 'Cynical and pessimistic')
    ]
    
    # Prepare data for bulk insert
    tags_data = []
    now = datetime.utcnow()
    
    # Add style tags
    for name, value, description in style_tags:
        tags_data.append({
            'id': str(uuid.uuid4()),
            'name': name,
            'category': 'style',
            'value': value,
            'description': description,
            'created_at': now
        })
    
    # Add format tags
    for name, value, description in format_tags:
        tags_data.append({
            'id': str(uuid.uuid4()),
            'name': name,
            'category': 'format',
            'value': value,
            'description': description,
            'created_at': now
        })
    
    # Add topic tags
    for name, value, description in topic_tags:
        tags_data.append({
            'id': str(uuid.uuid4()),
            'name': name,
            'category': 'topic',
            'value': value,
            'description': description,
            'created_at': now
        })
    
    # Add tone tags
    for name, value, description in tone_tags:
        tags_data.append({
            'id': str(uuid.uuid4()),
            'name': name,
            'category': 'tone',
            'value': value,
            'description': description,
            'created_at': now
        })
    
    # Bulk insert all tags
    op.bulk_insert(tags_table, tags_data)
    
    print(f"Seeded {len(tags_data)} default tags for personalization system")


def downgrade() -> None:
    """Remove seeded default tags."""
    
    # Delete all seeded tags
    op.execute("DELETE FROM tags WHERE category IN ('style', 'format', 'topic', 'tone')")
    
    print("Removed default tags")