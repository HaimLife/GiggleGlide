"""Seed initial jokes and categories

Revision ID: 002
Revises: 001
Create Date: 2025-07-11 17:52:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
import uuid

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create temporary table references for bulk insert
    categories_table = table('categories',
        column('id', sa.String),
        column('name', sa.String),
        column('display_name', sa.String),
        column('description', sa.Text),
        column('joke_count', sa.Integer),
    )
    
    jokes_table = table('jokes',
        column('id', sa.String),
        column('text', sa.Text),
        column('category', sa.String),
        column('language', sa.String),
        column('rating', sa.Float),
        column('view_count', sa.Integer),
        column('like_count', sa.Integer),
        column('external_id', sa.String),
        column('source', sa.String),
    )

    # Insert categories
    categories_data = [
        {
            'id': str(uuid.uuid4()),
            'name': 'programming',
            'display_name': 'Programming',
            'description': 'Jokes about coding, debugging, and software development',
            'joke_count': 0,
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'dadjokes',
            'display_name': 'Dad Jokes',
            'description': 'Classic dad jokes that make you groan and laugh',
            'joke_count': 0,
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'science',
            'display_name': 'Science',
            'description': 'Nerdy jokes about physics, chemistry, and biology',
            'joke_count': 0,
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'puns',
            'display_name': 'Puns',
            'description': 'Wordplay and puns that are so bad they\'re good',
            'joke_count': 0,
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'oneliners',
            'display_name': 'One-Liners',
            'description': 'Quick and witty one-line jokes',
            'joke_count': 0,
        },
    ]
    
    op.bulk_insert(categories_table, categories_data)

    # Insert sample jokes
    jokes_data = [
        # Programming jokes
        {
            'id': str(uuid.uuid4()),
            'text': 'Why do programmers prefer dark mode? Because light attracts bugs!',
            'category': 'programming',
            'language': 'en',
            'rating': 4.2,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'A SQL query walks into a bar, walks up to two tables and asks... "Can I join you?"',
            'category': 'programming',
            'language': 'en',
            'rating': 4.5,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'How many programmers does it take to change a light bulb? None. It\'s a hardware problem.',
            'category': 'programming',
            'language': 'en',
            'rating': 3.8,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'There are only 10 types of people in the world: those who understand binary and those who don\'t.',
            'category': 'programming',
            'language': 'en',
            'rating': 4.0,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Why do Java developers wear glasses? Because they don\'t C#!',
            'category': 'programming',
            'language': 'en',
            'rating': 3.5,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        # Dad jokes
        {
            'id': str(uuid.uuid4()),
            'text': 'I\'m afraid for the calendar. Its days are numbered.',
            'category': 'dadjokes',
            'language': 'en',
            'rating': 3.7,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'What do you call a fake noodle? An impasta!',
            'category': 'dadjokes',
            'language': 'en',
            'rating': 4.1,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'I used to hate facial hair, but then it grew on me.',
            'category': 'dadjokes',
            'language': 'en',
            'rating': 3.9,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Why don\'t scientists trust atoms? Because they make up everything!',
            'category': 'dadjokes',
            'language': 'en',
            'rating': 4.3,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Did you hear about the mathematician who\'s afraid of negative numbers? He\'ll stop at nothing to avoid them.',
            'category': 'dadjokes',
            'language': 'en',
            'rating': 3.8,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        # Science jokes
        {
            'id': str(uuid.uuid4()),
            'text': 'Why can\'t you trust an atom? Because they make up everything!',
            'category': 'science',
            'language': 'en',
            'rating': 4.0,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'A photon checks into a hotel. The bellhop asks, "Can I help you with your luggage?" The photon replies, "No thanks, I\'m traveling light."',
            'category': 'science',
            'language': 'en',
            'rating': 4.6,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Why did the scarecrow win a Nobel Prize? He was outstanding in his field!',
            'category': 'science',
            'language': 'en',
            'rating': 3.9,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Helium walks into a bar. The bartender says, "We don\'t serve noble gases here." Helium doesn\'t react.',
            'category': 'science',
            'language': 'en',
            'rating': 4.4,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Two atoms are walking down the street. One says, "I think I lost an electron!" The other asks, "Are you positive?"',
            'category': 'science',
            'language': 'en',
            'rating': 4.2,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        # Puns
        {
            'id': str(uuid.uuid4()),
            'text': 'I\'m reading a book about anti-gravity. It\'s impossible to put down!',
            'category': 'puns',
            'language': 'en',
            'rating': 4.1,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Time flies like an arrow. Fruit flies like a banana.',
            'category': 'puns',
            'language': 'en',
            'rating': 4.3,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'I stayed up all night wondering where the sun went. Then it dawned on me.',
            'category': 'puns',
            'language': 'en',
            'rating': 3.8,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'The past, present, and future walked into a bar. It was tense.',
            'category': 'puns',
            'language': 'en',
            'rating': 4.5,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'I used to be a baker, but I couldn\'t make enough dough.',
            'category': 'puns',
            'language': 'en',
            'rating': 3.6,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        # One-liners
        {
            'id': str(uuid.uuid4()),
            'text': 'I told my wife she was drawing her eyebrows too high. She looked surprised.',
            'category': 'oneliners',
            'language': 'en',
            'rating': 4.0,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'Parallel lines have so much in common. It\'s a shame they\'ll never meet.',
            'category': 'oneliners',
            'language': 'en',
            'rating': 4.2,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'My therapist says I have a preoccupation with vengeance. We\'ll see about that.',
            'category': 'oneliners',
            'language': 'en',
            'rating': 4.4,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'I haven\'t spoken to my wife in years. I didn\'t want to interrupt her.',
            'category': 'oneliners',
            'language': 'en',
            'rating': 3.7,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
        {
            'id': str(uuid.uuid4()),
            'text': 'I\'m on a whiskey diet. I\'ve lost three days already.',
            'category': 'oneliners',
            'language': 'en',
            'rating': 3.9,
            'view_count': 0,
            'like_count': 0,
            'source': 'seed',
        },
    ]
    
    op.bulk_insert(jokes_table, jokes_data)
    
    # Update joke counts for each category
    op.execute("""
        UPDATE categories 
        SET joke_count = (
            SELECT COUNT(*) 
            FROM jokes 
            WHERE jokes.category = categories.name
        )
    """)


def downgrade() -> None:
    # Remove seeded data
    op.execute("DELETE FROM jokes WHERE source = 'seed'")
    op.execute("DELETE FROM categories WHERE name IN ('programming', 'dadjokes', 'science', 'puns', 'oneliners')")