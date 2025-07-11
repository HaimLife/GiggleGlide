"""Tests for tag repository functionality."""

import pytest
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from database.repositories.tag_repository import TagRepository
from database.models import Tag, JokeTag, UserTagScore, Joke, User


@pytest.fixture
async def tag_repo(async_session: AsyncSession):
    """Create a tag repository instance."""
    return TagRepository(async_session)


@pytest.fixture
async def sample_tags(async_session: AsyncSession):
    """Create sample tags for testing."""
    tags = [
        Tag(
            name="Observational",
            category="style",
            value="observational",
            description="Observational comedy style"
        ),
        Tag(
            name="Setup Punchline",
            category="format",
            value="setup_punchline",
            description="Traditional setup and punchline"
        ),
        Tag(
            name="Work",
            category="topic",
            value="work",
            description="Office and workplace humor"
        ),
        Tag(
            name="Witty",
            category="tone",
            value="witty",
            description="Clever and sharp humor"
        )
    ]
    
    for tag in tags:
        async_session.add(tag)
    
    await async_session.commit()
    
    for tag in tags:
        await async_session.refresh(tag)
    
    return tags


@pytest.fixture
async def sample_joke(async_session: AsyncSession):
    """Create a sample joke for testing."""
    joke = Joke(
        text="Why don't scientists trust atoms? Because they make up everything!",
        category="science",
        language="en",
        rating=4.5
    )
    
    async_session.add(joke)
    await async_session.commit()
    await async_session.refresh(joke)
    
    return joke


@pytest.fixture
async def sample_user(async_session: AsyncSession):
    """Create a sample user for testing."""
    user = User(
        username="test_user",
        email="test@example.com"
    )
    
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    
    return user


class TestTagRepository:
    """Test suite for TagRepository."""

    async def test_create_tag(self, tag_repo: TagRepository):
        """Test creating a new tag."""
        tag = await tag_repo.create_tag(
            name="Test Tag",
            category="style",
            value="test_tag",
            description="A test tag"
        )
        
        assert tag.name == "Test Tag"
        assert tag.category == "style"
        assert tag.value == "test_tag"
        assert tag.description == "A test tag"
        assert tag.id is not None

    async def test_create_duplicate_tag(self, tag_repo: TagRepository, sample_tags):
        """Test creating a duplicate tag returns existing tag."""
        existing_tag = sample_tags[0]
        
        tag = await tag_repo.create_tag(
            name=existing_tag.name,
            category=existing_tag.category,
            value=existing_tag.value
        )
        
        assert tag.id == existing_tag.id

    async def test_get_tags_by_category(self, tag_repo: TagRepository, sample_tags):
        """Test getting tags by category."""
        style_tags = await tag_repo.get_tags_by_category("style")
        assert len(style_tags) == 1
        assert style_tags[0].category == "style"
        
        topic_tags = await tag_repo.get_tags_by_category("topic")
        assert len(topic_tags) == 1
        assert topic_tags[0].category == "topic"

    async def test_add_joke_tag(self, tag_repo: TagRepository, sample_tags, sample_joke):
        """Test adding a tag to a joke."""
        tag = sample_tags[0]
        joke_tag = await tag_repo.add_joke_tag(
            joke_id=sample_joke.id,
            tag_id=tag.id,
            confidence=0.8
        )
        
        assert joke_tag.joke_id == sample_joke.id
        assert joke_tag.tag_id == tag.id
        assert joke_tag.confidence == 0.8

    async def test_add_duplicate_joke_tag(self, tag_repo: TagRepository, sample_tags, sample_joke):
        """Test adding duplicate joke tag updates confidence."""
        tag = sample_tags[0]
        
        # Add first time
        joke_tag1 = await tag_repo.add_joke_tag(
            joke_id=sample_joke.id,
            tag_id=tag.id,
            confidence=0.7
        )
        
        # Add again with different confidence
        joke_tag2 = await tag_repo.add_joke_tag(
            joke_id=sample_joke.id,
            tag_id=tag.id,
            confidence=0.9
        )
        
        assert joke_tag1.id == joke_tag2.id
        assert joke_tag2.confidence == 0.9

    async def test_get_joke_tags(self, tag_repo: TagRepository, sample_tags, sample_joke):
        """Test getting tags for a joke."""
        # Add multiple tags to joke
        for tag in sample_tags[:2]:
            await tag_repo.add_joke_tag(
                joke_id=sample_joke.id,
                tag_id=tag.id,
                confidence=0.8
            )
        
        joke_tags = await tag_repo.get_joke_tags(sample_joke.id)
        assert len(joke_tags) == 2
        
        # Check format (tag, confidence)
        for tag, confidence in joke_tags:
            assert isinstance(tag, Tag)
            assert confidence == 0.8

    async def test_remove_joke_tag(self, tag_repo: TagRepository, sample_tags, sample_joke):
        """Test removing a tag from a joke."""
        tag = sample_tags[0]
        
        # Add tag first
        await tag_repo.add_joke_tag(
            joke_id=sample_joke.id,
            tag_id=tag.id
        )
        
        # Remove tag
        success = await tag_repo.remove_joke_tag(
            joke_id=sample_joke.id,
            tag_id=tag.id
        )
        
        assert success is True
        
        # Verify removal
        joke_tags = await tag_repo.get_joke_tags(sample_joke.id)
        assert len(joke_tags) == 0

    async def test_update_user_tag_score(self, tag_repo: TagRepository, sample_tags, sample_user):
        """Test updating user tag scores."""
        tag = sample_tags[0]
        
        # First update
        score1 = await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=tag.id,
            score_delta=0.5
        )
        
        assert score1.user_id == sample_user.id
        assert score1.tag_id == tag.id
        assert score1.score > 0
        assert score1.interaction_count == 1

        # Second update
        score2 = await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=tag.id,
            score_delta=0.3
        )
        
        assert score2.id == score1.id  # Same record
        assert score2.score > score1.score  # Score increased
        assert score2.interaction_count == 2

    async def test_get_user_tag_scores(self, tag_repo: TagRepository, sample_tags, sample_user):
        """Test getting all tag scores for a user."""
        # Add scores for multiple tags
        for tag in sample_tags[:2]:
            await tag_repo.update_user_tag_score(
                user_id=sample_user.id,
                tag_id=tag.id,
                score_delta=0.4
            )
        
        scores = await tag_repo.get_user_tag_scores(sample_user.id)
        assert len(scores) == 2
        
        # Should be ordered by score descending
        for i in range(len(scores) - 1):
            assert scores[i].score >= scores[i + 1].score

    async def test_get_user_top_tags(self, tag_repo: TagRepository, sample_tags, sample_user):
        """Test getting user's top-rated tags."""
        # Add scores with different values
        await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=sample_tags[0].id,
            score_delta=0.8
        )
        await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=sample_tags[1].id,
            score_delta=0.6
        )
        await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=sample_tags[2].id,
            score_delta=-0.2  # Negative score
        )
        
        top_tags = await tag_repo.get_user_top_tags(sample_user.id, limit=5)
        
        # Should only return positive scores
        assert len(top_tags) == 2
        
        # Should be ordered by score descending
        assert top_tags[0][1] > top_tags[1][1]

    async def test_get_tag_popularity(self, tag_repo: TagRepository, sample_tags, sample_joke):
        """Test getting tag popularity based on usage."""
        # Add tags to joke with different frequencies
        popular_tag = sample_tags[0]
        less_popular_tag = sample_tags[1]
        
        await tag_repo.add_joke_tag(sample_joke.id, popular_tag.id)
        await tag_repo.add_joke_tag(sample_joke.id, less_popular_tag.id)
        
        popularity = await tag_repo.get_tag_popularity(limit=10)
        
        assert len(popularity) >= 2
        
        # Check format (tag, usage_count)
        for tag, count in popularity:
            assert isinstance(tag, Tag)
            assert isinstance(count, int)
            assert count > 0

    async def test_initialize_default_tags(self, tag_repo: TagRepository):
        """Test initializing default tag taxonomy."""
        count = await tag_repo.initialize_default_tags()
        
        assert count > 0
        
        # Verify tags were created in all categories
        style_tags = await tag_repo.get_tags_by_category("style")
        format_tags = await tag_repo.get_tags_by_category("format")
        topic_tags = await tag_repo.get_tags_by_category("topic")
        tone_tags = await tag_repo.get_tags_by_category("tone")
        
        assert len(style_tags) > 0
        assert len(format_tags) > 0
        assert len(topic_tags) > 0
        assert len(tone_tags) > 0

    async def test_score_bounds_validation(self, tag_repo: TagRepository, sample_tags, sample_user):
        """Test that user tag scores are properly bounded."""
        tag = sample_tags[0]
        
        # Test extreme positive delta
        score = await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=tag.id,
            score_delta=2.0  # Extreme value
        )
        
        assert -1.0 <= score.score <= 1.0
        
        # Test extreme negative delta
        score = await tag_repo.update_user_tag_score(
            user_id=sample_user.id,
            tag_id=tag.id,
            score_delta=-5.0  # Extreme negative value
        )
        
        assert -1.0 <= score.score <= 1.0

    async def test_learning_rate_decay(self, tag_repo: TagRepository, sample_tags, sample_user):
        """Test that learning rate decreases with more interactions."""
        tag = sample_tags[0]
        
        # First few interactions should have larger impact
        initial_scores = []
        for i in range(5):
            score = await tag_repo.update_user_tag_score(
                user_id=sample_user.id,
                tag_id=tag.id,
                score_delta=0.1
            )
            initial_scores.append(score.score)
        
        # Later interactions should have smaller impact
        later_scores = []
        for i in range(5):
            score = await tag_repo.update_user_tag_score(
                user_id=sample_user.id,
                tag_id=tag.id,
                score_delta=0.1
            )
            later_scores.append(score.score)
        
        # Check that early changes are larger than later changes
        early_change = initial_scores[1] - initial_scores[0]
        later_change = later_scores[1] - later_scores[0]
        
        assert early_change > later_change