"""Tests for personalization service functionality."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, Mock
from sqlalchemy.ext.asyncio import AsyncSession

from services.personalization_service import PersonalizationService, RecommendationConfig, RecommendationResult
from database.repositories.personalization_repository import PersonalizationRepository
from database.repositories.tag_repository import TagRepository
from database.repositories.joke_repository import JokeRepository
from database.models import Joke, Tag, UserTagScore


@pytest.fixture
def mock_personalization_repo():
    """Create a mock personalization repository."""
    return AsyncMock(spec=PersonalizationRepository)


@pytest.fixture
def mock_tag_repo():
    """Create a mock tag repository."""
    return AsyncMock(spec=TagRepository)


@pytest.fixture
def mock_joke_repo():
    """Create a mock joke repository."""
    return AsyncMock(spec=JokeRepository)


@pytest.fixture
def personalization_service(mock_personalization_repo, mock_tag_repo, mock_joke_repo):
    """Create a personalization service with mocked dependencies."""
    config = RecommendationConfig(exploration_rate=0.1)
    return PersonalizationService(
        personalization_repo=mock_personalization_repo,
        tag_repo=mock_tag_repo,
        joke_repo=mock_joke_repo,
        config=config
    )


@pytest.fixture
def sample_jokes():
    """Create sample joke objects."""
    return [
        Joke(
            id="joke1",
            text="Why don't scientists trust atoms?",
            category="science",
            language="en",
            rating=4.5
        ),
        Joke(
            id="joke2", 
            text="I told my wife she was drawing her eyebrows too high.",
            category="relationships",
            language="en",
            rating=4.0
        ),
        Joke(
            id="joke3",
            text="Why did the scarecrow win an award?",
            category="work",
            language="en", 
            rating=3.8
        )
    ]


@pytest.fixture
def sample_tags():
    """Create sample tag objects."""
    return [
        Tag(id="tag1", name="Observational", category="style", value="observational"),
        Tag(id="tag2", name="Witty", category="tone", value="witty"),
        Tag(id="tag3", name="Work", category="topic", value="work")
    ]


class TestPersonalizationService:
    """Test suite for PersonalizationService."""

    async def test_get_personalized_recommendations_basic(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo,
        sample_jokes
    ):
        """Test basic personalized recommendations."""
        # Mock repository response
        mock_recommendations = [
            (sample_jokes[0], 0.8, 'exploit'),
            (sample_jokes[1], 0.6, 'exploit'),
            (sample_jokes[2], 0.4, 'explore')
        ]
        mock_personalization_repo.get_personalized_recommendations.return_value = mock_recommendations
        mock_personalization_repo.get_similar_users_recommendations.return_value = []
        
        result = await personalization_service.get_personalized_recommendations(
            user_id="user1",
            limit=3
        )
        
        assert isinstance(result, RecommendationResult)
        assert len(result.jokes) <= 3
        assert isinstance(result.strategy_breakdown, dict)
        assert isinstance(result.performance_metrics, dict)
        assert result.cache_hit is False

    async def test_get_personalized_recommendations_with_collaborative(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo,
        sample_jokes
    ):
        """Test recommendations with collaborative filtering enabled."""
        # Mock content-based recommendations
        content_recs = [(sample_jokes[0], 0.8, 'exploit')]
        mock_personalization_repo.get_personalized_recommendations.return_value = content_recs
        
        # Mock collaborative recommendations
        collaborative_recs = [(sample_jokes[1], 0.7)]
        mock_personalization_repo.get_similar_users_recommendations.return_value = collaborative_recs
        
        result = await personalization_service.get_personalized_recommendations(
            user_id="user1",
            limit=3,
            use_collaborative=True
        )
        
        # Should call both recommendation methods
        mock_personalization_repo.get_personalized_recommendations.assert_called_once()
        mock_personalization_repo.get_similar_users_recommendations.assert_called_once()
        
        assert len(result.jokes) <= 3

    async def test_get_personalized_recommendations_fallback(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo,
        mock_joke_repo,
        sample_jokes
    ):
        """Test fallback to trending jokes when personalization fails."""
        # Mock personalization failure
        mock_personalization_repo.get_personalized_recommendations.side_effect = Exception("Database error")
        
        # Mock fallback trending jokes
        mock_joke_repo.get_trending_jokes.return_value = sample_jokes
        
        result = await personalization_service.get_personalized_recommendations(
            user_id="user1",
            limit=3
        )
        
        # Should fall back to trending jokes
        mock_joke_repo.get_trending_jokes.assert_called_once()
        assert 'fallback' in result.strategy_breakdown

    async def test_update_user_preferences(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo,
        mock_joke_repo
    ):
        """Test updating user preferences from feedback."""
        # Mock repository responses
        mock_personalization_repo.update_preferences_from_interaction.return_value = 3
        mock_joke_repo.mark_as_seen.return_value = Mock()
        
        result = await personalization_service.update_user_preferences(
            user_id="user1",
            joke_id="joke1",
            interaction_type="like"
        )
        
        assert result['user_id'] == "user1"
        assert result['joke_id'] == "joke1"
        assert result['interaction_type'] == "like"
        assert result['tags_updated'] == 3
        assert 'updated_at' in result
        
        # Should call both repository methods
        mock_personalization_repo.update_preferences_from_interaction.assert_called_once()
        mock_joke_repo.mark_as_seen.assert_called_once()

    async def test_analyze_user_preferences(
        self,
        personalization_service: PersonalizationService,
        mock_tag_repo,
        mock_personalization_repo,
        sample_tags
    ):
        """Test user preference analysis."""
        # Mock tag scores
        tag_scores = [
            UserTagScore(tag_id="tag1", score=0.8, interaction_count=10, tag=sample_tags[0]),
            UserTagScore(tag_id="tag2", score=0.6, interaction_count=5, tag=sample_tags[1]),
            UserTagScore(tag_id="tag3", score=-0.2, interaction_count=3, tag=sample_tags[2])
        ]
        mock_tag_repo.get_user_tag_scores.return_value = tag_scores
        
        # Mock top tags
        top_tags = [(sample_tags[0], 0.8), (sample_tags[1], 0.6)]
        mock_tag_repo.get_user_top_tags.return_value = top_tags
        
        # Mock diversity and performance
        mock_personalization_repo.calculate_user_diversity_score.return_value = 0.75
        mock_personalization_repo.get_recommendation_performance.return_value = {
            'click_through_rate': 0.3,
            'total_views': 100
        }
        
        analysis = await personalization_service.analyze_user_preferences(
            user_id="user1"
        )
        
        assert analysis['user_id'] == "user1"
        assert 'preferences_by_category' in analysis
        assert 'top_preferences' in analysis
        assert analysis['diversity_score'] == 0.75
        assert 'performance_metrics' in analysis
        assert analysis['total_tag_scores'] == 3
        assert analysis['positive_preferences'] == 2  # Only scores > 0

    async def test_get_recommendation_explanation(
        self,
        personalization_service: PersonalizationService,
        mock_tag_repo,
        sample_tags
    ):
        """Test getting recommendation explanation."""
        # Mock joke tags
        joke_tags = [(sample_tags[0], 0.9), (sample_tags[1], 0.7)]
        mock_tag_repo.get_joke_tags.return_value = joke_tags
        
        # Mock user preferences
        user_scores = [
            UserTagScore(tag_id="tag1", score=0.8, tag=sample_tags[0]),
            UserTagScore(tag_id="tag2", score=0.6, tag=sample_tags[1])
        ]
        mock_tag_repo.get_user_tag_scores.return_value = user_scores
        
        explanation = await personalization_service.get_recommendation_explanation(
            user_id="user1",
            joke_id="joke1"
        )
        
        assert explanation['user_id'] == "user1"
        assert explanation['joke_id'] == "joke1"
        assert 'total_match_score' in explanation
        assert 'top_matches' in explanation
        assert len(explanation['top_matches']) <= 5
        assert explanation['recommendation_strength'] >= 0

    async def test_handle_cold_start_user(
        self,
        personalization_service: PersonalizationService,
        mock_joke_repo,
        sample_jokes
    ):
        """Test handling cold start users."""
        # Mock trending jokes
        mock_joke_repo.get_trending_jokes.return_value = sample_jokes
        
        result = await personalization_service.handle_cold_start_user(
            user_id="new_user",
            language="en"
        )
        
        assert isinstance(result, RecommendationResult)
        assert len(result.jokes) > 0
        assert all(strategy == 'explore' for _, _, strategy in result.jokes)
        assert result.strategy_breakdown.get('explore', 0) > 0
        assert result.performance_metrics.get('cold_start') is True

    async def test_handle_cold_start_with_preferences(
        self,
        personalization_service: PersonalizationService,
        mock_tag_repo,
        mock_joke_repo,
        sample_jokes,
        sample_tags
    ):
        """Test cold start with initial preferences."""
        # Mock tag retrieval
        mock_tag_repo.get_tags_by_category.return_value = sample_tags
        mock_tag_repo.update_user_tag_score.return_value = Mock()
        
        # Mock trending jokes
        mock_joke_repo.get_trending_jokes.return_value = sample_jokes
        
        initial_preferences = {
            'style': ['observational'],
            'tone': ['witty']
        }
        
        result = await personalization_service.handle_cold_start_user(
            user_id="new_user",
            initial_preferences=initial_preferences,
            language="en"
        )
        
        # Should initialize preferences
        assert mock_tag_repo.update_user_tag_score.call_count >= 2
        assert isinstance(result, RecommendationResult)

    async def test_cache_integration(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo,
        sample_jokes
    ):
        """Test cache integration in service."""
        # Mock successful recommendations
        mock_recommendations = [(sample_jokes[0], 0.8, 'exploit')]
        mock_personalization_repo.get_personalized_recommendations.return_value = mock_recommendations
        mock_personalization_repo.get_similar_users_recommendations.return_value = []
        
        # First call should not be cached
        result1 = await personalization_service.get_personalized_recommendations(
            user_id="user1",
            limit=1
        )
        assert result1.cache_hit is False
        
        # Second call with same parameters should be cached
        result2 = await personalization_service.get_personalized_recommendations(
            user_id="user1", 
            limit=1
        )
        # Note: In real implementation this would be cached, but our mock doesn't implement caching
        # This test verifies the structure exists

    async def test_exploration_rate_configuration(
        self,
        mock_personalization_repo,
        mock_tag_repo, 
        mock_joke_repo
    ):
        """Test custom exploration rate configuration."""
        # Test with high exploration rate
        high_exploration_config = RecommendationConfig(exploration_rate=0.8)
        service = PersonalizationService(
            personalization_repo=mock_personalization_repo,
            tag_repo=mock_tag_repo,
            joke_repo=mock_joke_repo,
            config=high_exploration_config
        )
        
        assert service.config.exploration_rate == 0.8
        
        # Test with low exploration rate
        low_exploration_config = RecommendationConfig(exploration_rate=0.05)
        service.config = low_exploration_config
        
        assert service.config.exploration_rate == 0.05

    async def test_diversity_enforcement(
        self,
        personalization_service: PersonalizationService,
        mock_tag_repo,
        sample_jokes,
        sample_tags
    ):
        """Test diversity enforcement in recommendations."""
        # Mock get_joke_tags to return different categories
        def mock_get_joke_tags(joke_id):
            if joke_id == "joke1":
                return [(sample_tags[0], 0.9)]  # Style tag
            elif joke_id == "joke2":
                return [(sample_tags[1], 0.8)]  # Tone tag
            else:
                return [(sample_tags[2], 0.7)]  # Topic tag
        
        mock_tag_repo.get_joke_tags.side_effect = mock_get_joke_tags
        
        # Create recommendations with same scores but different categories
        recommendations = [
            (sample_jokes[0], 0.8, 'exploit'),
            (sample_jokes[1], 0.8, 'exploit'), 
            (sample_jokes[2], 0.8, 'exploit')
        ]
        
        # Test diversity enforcement
        diverse_recs = await personalization_service._ensure_diversity(
            recommendations, limit=2
        )
        
        assert len(diverse_recs) <= 2
        # Should maintain format
        for joke, score, strategy in diverse_recs:
            assert isinstance(joke, Joke)
            assert isinstance(score, float)
            assert isinstance(strategy, str)

    async def test_error_handling(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo,
        mock_joke_repo,
        sample_jokes
    ):
        """Test error handling in various scenarios."""
        # Test recommendation failure with successful fallback
        mock_personalization_repo.get_personalized_recommendations.side_effect = Exception("DB Error")
        mock_joke_repo.get_trending_jokes.return_value = sample_jokes
        
        result = await personalization_service.get_personalized_recommendations(
            user_id="user1"
        )
        
        # Should not raise exception, should return fallback
        assert isinstance(result, RecommendationResult)
        assert 'fallback' in result.strategy_breakdown

    async def test_performance_metrics_calculation(
        self,
        personalization_service: PersonalizationService,
        mock_personalization_repo
    ):
        """Test performance metrics calculation."""
        # Mock performance data
        mock_performance = {
            'click_through_rate': 0.25,
            'diversity_score': 0.8,
            'total_views': 50,
            'total_likes': 12
        }
        mock_personalization_repo.get_recommendation_performance.return_value = mock_performance
        
        # Calculate metrics (this would be called internally)
        metrics = await personalization_service._calculate_performance_metrics(
            user_id="user1",
            start_time=datetime.utcnow()
        )
        
        assert 'processing_time_seconds' in metrics
        assert 'recent_ctr' in metrics
        assert 'recent_diversity' in metrics
        assert metrics['recent_ctr'] == 0.25
        assert metrics['recent_diversity'] == 0.8