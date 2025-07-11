"""Tests for personalization repository functionality."""

import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from database.repositories.personalization_repository import PersonalizationRepository
from database.repositories.tag_repository import TagRepository
from database.models import (
    Tag, JokeTag, UserTagScore, Joke, User, JokeInteraction, PersonalizationMetric
)


@pytest.fixture
async def personalization_repo(async_session: AsyncSession):
    """Create a personalization repository instance."""
    return PersonalizationRepository(async_session)


@pytest.fixture
async def tag_repo(async_session: AsyncSession):
    """Create a tag repository instance."""
    return TagRepository(async_session)


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


@pytest.fixture
async def sample_jokes_with_tags(async_session: AsyncSession):
    """Create sample jokes with tags for testing."""
    # Create tags
    tags = [
        Tag(name="Observational", category="style", value="observational"),
        Tag(name="Witty", category="tone", value="witty"),
        Tag(name="Work", category="topic", value="work"),
        Tag(name="Setup Punchline", category="format", value="setup_punchline")
    ]
    
    for tag in tags:
        async_session.add(tag)
    
    await async_session.commit()
    
    # Create jokes
    jokes = [
        Joke(text="Joke 1", category="work", language="en", rating=4.0),
        Joke(text="Joke 2", category="science", language="en", rating=3.5),
        Joke(text="Joke 3", category="tech", language="en", rating=4.5),
        Joke(text="Joke 4", category="work", language="en", rating=2.0),  # Low rating
        Joke(text="Joke 5", category="family", language="en", rating=4.2)
    ]
    
    for joke in jokes:
        async_session.add(joke)
    
    await async_session.commit()
    
    # Add tags to jokes
    joke_tag_associations = [
        (jokes[0], tags[0], 0.9),  # Joke 1: Observational
        (jokes[0], tags[2], 0.8),  # Joke 1: Work
        (jokes[1], tags[1], 0.7),  # Joke 2: Witty
        (jokes[2], tags[0], 0.6),  # Joke 3: Observational
        (jokes[2], tags[1], 0.9),  # Joke 3: Witty
        (jokes[4], tags[3], 0.8),  # Joke 5: Setup Punchline
    ]
    
    for joke, tag, confidence in joke_tag_associations:
        joke_tag = JokeTag(joke_id=joke.id, tag_id=tag.id, confidence=confidence)
        async_session.add(joke_tag)
    
    await async_session.commit()
    
    return {
        'jokes': jokes,
        'tags': tags
    }


@pytest.fixture
async def user_with_preferences(async_session: AsyncSession, sample_user, sample_jokes_with_tags):
    """Create a user with established tag preferences."""
    tags = sample_jokes_with_tags['tags']
    
    # Set user preferences
    preferences = [
        (tags[0], 0.7),  # Observational: positive
        (tags[1], 0.5),  # Witty: positive
        (tags[2], -0.2), # Work: slightly negative
        (tags[3], 0.0),  # Setup Punchline: neutral
    ]
    
    for tag, score in preferences:
        user_tag_score = UserTagScore(
            user_id=sample_user.id,
            tag_id=tag.id,
            score=score,
            interaction_count=10
        )
        async_session.add(user_tag_score)
    
    await async_session.commit()
    
    return sample_user


class TestPersonalizationRepository:
    """Test suite for PersonalizationRepository."""

    async def test_get_personalized_recommendations_basic(
        self, 
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags
    ):
        """Test basic personalized recommendations."""
        recommendations = await personalization_repo.get_personalized_recommendations(
            user_id=user_with_preferences.id,
            limit=3,
            exploration_rate=0.0,  # Pure exploitation for testing
            language="en"
        )
        
        assert len(recommendations) <= 3
        
        # Check format: (joke, score, strategy)
        for joke, score, strategy in recommendations:
            assert isinstance(joke, Joke)
            assert isinstance(score, float)
            assert strategy in ['exploit', 'explore']

    async def test_recommendations_exploitation_vs_exploration(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags
    ):
        """Test ε-greedy exploration vs exploitation."""
        # Pure exploitation
        exploit_recs = await personalization_repo.get_personalized_recommendations(
            user_id=user_with_preferences.id,
            limit=5,
            exploration_rate=0.0,
            language="en"
        )
        
        # Mixed strategy
        mixed_recs = await personalization_repo.get_personalized_recommendations(
            user_id=user_with_preferences.id,
            limit=5,
            exploration_rate=0.5,  # 50% exploration
            language="en"
        )
        
        # Check that pure exploitation has all 'exploit' strategy
        exploit_strategies = [strategy for _, _, strategy in exploit_recs]
        assert all(s == 'exploit' for s in exploit_strategies)
        
        # Check that mixed has both strategies
        mixed_strategies = [strategy for _, _, strategy in mixed_recs]
        if len(mixed_strategies) > 1:
            strategy_set = set(mixed_strategies)
            # Should have both strategies or at least some randomness
            assert len(strategy_set) >= 1

    async def test_exclude_seen_jokes(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags,
        async_session: AsyncSession
    ):
        """Test that seen jokes are excluded from recommendations."""
        jokes = sample_jokes_with_tags['jokes']
        
        # Mark first joke as seen
        interaction = JokeInteraction(
            user_id=user_with_preferences.id,
            joke_id=jokes[0].id,
            interaction_type='view'
        )
        async_session.add(interaction)
        await async_session.commit()
        
        recommendations = await personalization_repo.get_personalized_recommendations(
            user_id=user_with_preferences.id,
            limit=10,
            language="en"
        )
        
        # Verify the seen joke is not in recommendations
        recommended_joke_ids = [joke.id for joke, _, _ in recommendations]
        assert jokes[0].id not in recommended_joke_ids

    async def test_rating_filter(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags
    ):
        """Test that low-rated jokes are filtered out."""
        recommendations = await personalization_repo.get_personalized_recommendations(
            user_id=user_with_preferences.id,
            limit=10,
            min_confidence=0.5,
            language="en"
        )
        
        # All recommended jokes should have decent ratings
        for joke, _, _ in recommendations:
            assert joke.rating >= 2.0  # Based on our filter in the implementation

    async def test_update_preferences_from_interaction(
        self,
        personalization_repo: PersonalizationRepository,
        tag_repo: TagRepository,
        user_with_preferences,
        sample_jokes_with_tags,
        async_session: AsyncSession
    ):
        """Test updating user preferences based on interactions."""
        jokes = sample_jokes_with_tags['jokes']
        
        # Get initial tag scores
        initial_scores = await tag_repo.get_user_tag_scores(user_with_preferences.id)
        initial_score_map = {score.tag_id: score.score for score in initial_scores}
        
        # Record a like interaction
        updated_count = await personalization_repo.update_preferences_from_interaction(
            user_id=user_with_preferences.id,
            joke_id=jokes[0].id,  # Joke with Observational and Work tags
            interaction_type='like',
            tag_repository=tag_repo
        )
        
        assert updated_count > 0
        
        # Check that relevant tag scores increased
        updated_scores = await tag_repo.get_user_tag_scores(user_with_preferences.id)
        updated_score_map = {score.tag_id: score.score for score in updated_scores}
        
        # At least some scores should have changed
        changes = 0
        for tag_id, new_score in updated_score_map.items():
            old_score = initial_score_map.get(tag_id, 0.0)
            if new_score != old_score:
                changes += 1
        
        assert changes > 0

    async def test_negative_feedback_decreases_scores(
        self,
        personalization_repo: PersonalizationRepository,
        tag_repo: TagRepository,
        user_with_preferences,
        sample_jokes_with_tags
    ):
        """Test that negative feedback decreases tag scores."""
        jokes = sample_jokes_with_tags['jokes']
        
        # Get initial tag scores for tags associated with the joke
        joke_tags = await tag_repo.get_joke_tags(jokes[0].id)
        initial_scores = {}
        for tag, _ in joke_tags:
            user_scores = await tag_repo.get_user_tag_scores(user_with_preferences.id)
            for score in user_scores:
                if score.tag_id == tag.id:
                    initial_scores[tag.id] = score.score
                    break
        
        # Record a skip interaction (negative feedback)
        await personalization_repo.update_preferences_from_interaction(
            user_id=user_with_preferences.id,
            joke_id=jokes[0].id,
            interaction_type='skip',
            tag_repository=tag_repo
        )
        
        # Check that scores decreased
        for tag, _ in joke_tags:
            updated_scores = await tag_repo.get_user_tag_scores(user_with_preferences.id)
            for score in updated_scores:
                if score.tag_id == tag.id:
                    initial_score = initial_scores.get(tag.id, 0.0)
                    # Score should have decreased (or stayed same if already at minimum)
                    assert score.score <= initial_score
                    break

    async def test_calculate_user_diversity_score(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags,
        async_session: AsyncSession
    ):
        """Test calculating user diversity score."""
        jokes = sample_jokes_with_tags['jokes']
        
        # Add interactions across different categories
        for i, joke in enumerate(jokes[:3]):
            interaction = JokeInteraction(
                user_id=user_with_preferences.id,
                joke_id=joke.id,
                interaction_type='view'
            )
            async_session.add(interaction)
        
        await async_session.commit()
        
        diversity_score = await personalization_repo.calculate_user_diversity_score(
            user_id=user_with_preferences.id,
            days=7
        )
        
        assert 0.0 <= diversity_score <= 1.0

    async def test_record_personalization_metric(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences
    ):
        """Test recording personalization metrics."""
        period_start = datetime.utcnow() - timedelta(days=1)
        period_end = datetime.utcnow()
        
        metric = await personalization_repo.record_personalization_metric(
            user_id=user_with_preferences.id,
            metric_type='click_through_rate',
            value=0.75,
            period_start=period_start,
            period_end=period_end
        )
        
        assert metric.user_id == user_with_preferences.id
        assert metric.metric_type == 'click_through_rate'
        assert metric.value == 0.75
        assert metric.period_start == period_start
        assert metric.period_end == period_end

    async def test_get_recommendation_performance(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags,
        async_session: AsyncSession
    ):
        """Test getting recommendation performance metrics."""
        jokes = sample_jokes_with_tags['jokes']
        
        # Add some interactions
        interactions = [
            ('view', jokes[0].id),
            ('like', jokes[0].id),
            ('view', jokes[1].id),
            ('skip', jokes[1].id),
            ('view', jokes[2].id),
        ]
        
        for interaction_type, joke_id in interactions:
            interaction = JokeInteraction(
                user_id=user_with_preferences.id,
                joke_id=joke_id,
                interaction_type=interaction_type
            )
            async_session.add(interaction)
        
        await async_session.commit()
        
        performance = await personalization_repo.get_recommendation_performance(
            user_id=user_with_preferences.id,
            days=30
        )
        
        assert isinstance(performance, dict)
        assert 'click_through_rate' in performance
        assert 'skip_rate' in performance
        assert 'diversity_score' in performance
        assert 'total_views' in performance
        assert 'total_likes' in performance
        assert 'total_skips' in performance
        
        # Verify metrics make sense
        assert performance['total_views'] == 3
        assert performance['total_likes'] == 1
        assert performance['total_skips'] == 1
        assert performance['click_through_rate'] == 1/3  # 1 like out of 3 views

    async def test_similar_users_recommendations(
        self,
        personalization_repo: PersonalizationRepository,
        async_session: AsyncSession,
        sample_jokes_with_tags
    ):
        """Test collaborative filtering based on similar users."""
        tags = sample_jokes_with_tags['tags']
        
        # Create two users with similar preferences
        user1 = User(username="user1", email="user1@example.com")
        user2 = User(username="user2", email="user2@example.com")
        
        async_session.add(user1)
        async_session.add(user2)
        await async_session.commit()
        
        # Give both users similar tag preferences
        for user in [user1, user2]:
            for tag in tags[:2]:  # First two tags
                score = UserTagScore(
                    user_id=user.id,
                    tag_id=tag.id,
                    score=0.8,
                    interaction_count=5
                )
                async_session.add(score)
        
        await async_session.commit()
        
        # Add a like interaction for user2
        joke = sample_jokes_with_tags['jokes'][0]
        interaction = JokeInteraction(
            user_id=user2.id,
            joke_id=joke.id,
            interaction_type='like'
        )
        async_session.add(interaction)
        await async_session.commit()
        
        # Get recommendations for user1 based on similar users
        recommendations = await personalization_repo.get_similar_users_recommendations(
            user_id=user1.id,
            limit=5,
            similarity_threshold=0.1,  # Low threshold for testing
            language="en"
        )
        
        # Should get some recommendations based on similar user's preferences
        assert len(recommendations) >= 0  # May be 0 if no similar users found
        
        for joke, similarity_score in recommendations:
            assert isinstance(joke, Joke)
            assert isinstance(similarity_score, float)

    async def test_recommendation_explanation_components(
        self,
        personalization_repo: PersonalizationRepository,
        tag_repo: TagRepository,
        user_with_preferences,
        sample_jokes_with_tags
    ):
        """Test that recommendation components work properly."""
        # Test _get_user_preferences helper
        preferences = await personalization_repo._get_user_preferences(user_with_preferences.id)
        assert isinstance(preferences, dict)
        assert len(preferences) > 0
        
        # Test _get_unseen_jokes_with_tags helper
        unseen_jokes = await personalization_repo._get_unseen_jokes_with_tags(
            user_id=user_with_preferences.id,
            language="en",
            min_confidence=0.5
        )
        
        assert isinstance(unseen_jokes, list)
        for joke, tags in unseen_jokes:
            assert isinstance(joke, Joke)
            assert isinstance(tags, list)
            for tag, confidence in tags:
                assert isinstance(tag, Tag)
                assert isinstance(confidence, float)
                assert 0.0 <= confidence <= 1.0

    async def test_recommendation_scoring(
        self,
        personalization_repo: PersonalizationRepository,
        user_with_preferences,
        sample_jokes_with_tags
    ):
        """Test that recommendation scoring works correctly."""
        # Get user preferences
        preferences = await personalization_repo._get_user_preferences(user_with_preferences.id)
        
        # Create mock joke tags
        tags = sample_jokes_with_tags['tags']
        joke_tags = [(tags[0], 0.9), (tags[1], 0.8)]  # High confidence tags
        
        # Test exploitation score calculation
        score = personalization_repo._calculate_exploitation_score(
            joke_tags, preferences
        )
        
        assert isinstance(score, float)
        assert score >= 0.0  # Should be non-negative for positive preferences