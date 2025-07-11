"""Test configuration and fixtures for repository tests."""

import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
import tempfile
import os

from database.models import Base
from database.repositories.factory import RepositoryFactory
from database.repositories import (
    JokeRepository,
    UserRepository,
    CategoryRepository,
    InteractionRepository
)


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_engine():
    """Create a test database engine using SQLite in memory."""
    # Use temporary file for SQLite to avoid connection issues
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    temp_file.close()
    
    database_url = f"sqlite+aiosqlite:///{temp_file.name}"
    
    engine = create_async_engine(
        database_url,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        echo=False
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Cleanup
    await engine.dispose()
    os.unlink(temp_file.name)


@pytest.fixture
async def session_factory(test_engine):
    """Create session factory for testing."""
    return async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )


@pytest.fixture
async def session(session_factory) -> AsyncGenerator[AsyncSession, None]:
    """Create a database session for testing."""
    async with session_factory() as session:
        yield session


@pytest.fixture
async def repository_factory(session) -> RepositoryFactory:
    """Create repository factory for testing."""
    return RepositoryFactory(session)


@pytest.fixture
async def joke_repository(session) -> JokeRepository:
    """Create joke repository for testing."""
    return JokeRepository(session)


@pytest.fixture
async def user_repository(session) -> UserRepository:
    """Create user repository for testing."""
    return UserRepository(session)


@pytest.fixture
async def category_repository(session) -> CategoryRepository:
    """Create category repository for testing."""
    return CategoryRepository(session)


@pytest.fixture
async def interaction_repository(session) -> InteractionRepository:
    """Create interaction repository for testing."""
    return InteractionRepository(session)


# Test data fixtures

@pytest.fixture
async def sample_user_data():
    """Sample user data for testing."""
    return {
        'username': 'testuser123',
        'email': 'test@example.com',
        'preferred_language': 'en'
    }


@pytest.fixture
async def sample_joke_data():
    """Sample joke data for testing."""
    return {
        'text': 'Why did the chicken cross the road? To get to the other side!',
        'category': 'classic',
        'language': 'en',
        'rating': 3.5,
        'view_count': 10,
        'like_count': 5
    }


@pytest.fixture
async def sample_category_data():
    """Sample category data for testing."""
    return {
        'name': 'test_category',
        'display_name': 'Test Category',
        'description': 'A category for testing purposes'
    }


@pytest.fixture
async def created_user(user_repository, sample_user_data):
    """Create a user for testing."""
    user = await user_repository.create(sample_user_data)
    return user


@pytest.fixture
async def created_joke(joke_repository, sample_joke_data):
    """Create a joke for testing."""
    joke = await joke_repository.create(sample_joke_data)
    return joke


@pytest.fixture
async def created_category(category_repository, sample_category_data):
    """Create a category for testing."""
    category = await category_repository.create(sample_category_data)
    return category


@pytest.fixture
async def multiple_users(user_repository):
    """Create multiple users for testing."""
    users = []
    for i in range(5):
        user_data = {
            'username': f'testuser{i}',
            'email': f'test{i}@example.com',
            'preferred_language': 'en'
        }
        user = await user_repository.create(user_data)
        users.append(user)
    return users


@pytest.fixture
async def multiple_jokes(joke_repository):
    """Create multiple jokes for testing."""
    jokes = []
    categories = ['funny', 'puns', 'oneliners', 'dad_jokes']
    
    for i in range(10):
        joke_data = {
            'text': f'This is test joke number {i}',
            'category': categories[i % len(categories)],
            'language': 'en',
            'rating': 2.0 + (i % 4),  # Ratings from 2.0 to 5.0
            'view_count': i * 10,
            'like_count': i * 2
        }
        joke = await joke_repository.create(joke_data)
        jokes.append(joke)
    return jokes


@pytest.fixture
async def multiple_categories(category_repository):
    """Create multiple categories for testing."""
    categories = []
    category_names = ['funny', 'puns', 'oneliners', 'dad_jokes', 'knock_knock']
    
    for name in category_names:
        category_data = {
            'name': name,
            'display_name': name.replace('_', ' ').title(),
            'description': f'Category for {name} jokes'
        }
        category = await category_repository.create(category_data)
        categories.append(category)
    return categories


# Performance testing fixtures

@pytest.fixture
async def large_dataset(user_repository, joke_repository, interaction_repository):
    """Create a large dataset for performance testing."""
    # Create 50 users
    users = []
    for i in range(50):
        user_data = {
            'username': f'perfuser{i}',
            'email': f'perf{i}@example.com',
            'preferred_language': 'en'
        }
        user = await user_repository.create(user_data, commit=False)
        users.append(user)
    
    # Create 200 jokes
    jokes = []
    categories = ['comedy', 'puns', 'oneliners', 'dad_jokes', 'knock_knock']
    for i in range(200):
        joke_data = {
            'text': f'Performance test joke {i} with some longer text to simulate real jokes',
            'category': categories[i % len(categories)],
            'language': 'en',
            'rating': 1.0 + (i % 5),
            'view_count': i,
            'like_count': i // 2
        }
        joke = await joke_repository.create(joke_data, commit=False)
        jokes.append(joke)
    
    # Commit all at once
    await user_repository.session.commit()
    
    return {
        'users': users,
        'jokes': jokes
    }


# Utility functions for tests

async def create_test_interactions(
    interaction_repository,
    users,
    jokes,
    interaction_count=100
):
    """Create test interactions between users and jokes."""
    import random
    
    interactions = []
    interaction_types = ['view', 'like', 'skip']
    
    for _ in range(interaction_count):
        user = random.choice(users)
        joke = random.choice(jokes)
        interaction_type = random.choice(interaction_types)
        
        try:
            interaction = await interaction_repository.record_feedback(
                user_id=user.id,
                joke_id=joke.id,
                interaction_type=interaction_type
            )
            interactions.append(interaction)
        except:
            # Skip if interaction already exists
            continue
    
    return interactions