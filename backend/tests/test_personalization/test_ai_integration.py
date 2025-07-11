"""Tests for AI integration in personalization service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

from services.personalization_service import PersonalizationService, RecommendationConfig
from services.ai_joke_service import AIJokeService, GeneratedJoke


@pytest.fixture
async def mock_repositories():
    """Create mock repositories."""
    return {
        'personalization_repo': AsyncMock(),
        'tag_repo': AsyncMock(),
        'joke_repo': AsyncMock()
    }


@pytest.fixture
async def mock_ai_service():
    """Create mock AI service."""
    service = AsyncMock(spec=AIJokeService)
    service.generate_personalized_jokes = AsyncMock()
    service.generate_fallback_jokes = AsyncMock()
    return service


@pytest.fixture
async def personalization_service(mock_repositories, mock_ai_service):
    """Create personalization service with AI."""
    service = PersonalizationService(
        personalization_repo=mock_repositories['personalization_repo'],
        tag_repo=mock_repositories['tag_repo'],
        joke_repo=mock_repositories['joke_repo'],
        ai_joke_service=mock_ai_service,
        config=RecommendationConfig()
    )
    return service


class TestAIFallbackGeneration:
    """Test AI fallback generation in personalization service."""

    @pytest.mark.asyncio
    async def test_fallback_uses_ai_when_insufficient_jokes(
        self, personalization_service, mock_repositories, mock_ai_service
    ):
        """Test AI generation triggered when not enough trending jokes."""
        # Mock insufficient trending jokes
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(
            return_value=[MagicMock(id="joke1", text="Trending joke")]
        )
        
        # Mock user tag scores for personalization
        mock_tag_scores = [
            MagicMock(
                tag=MagicMock(category="style", value="observational"),
                score=0.8
            ),
            MagicMock(
                tag=MagicMock(category="topic", value="technology"),
                score=0.7
            )
        ]
        mock_repositories['tag_repo'].get_user_tag_scores = AsyncMock(
            return_value=mock_tag_scores
        )
        
        # Mock AI generation
        generated_jokes = [
            GeneratedJoke(
                text="AI generated joke 1",
                tags={"style": ["observational"], "topic": ["technology"]},
                language="en",
                confidence=0.9,
                model="gpt-4o",
                generation_id="gen-123"
            ),
            GeneratedJoke(
                text="AI generated joke 2",
                tags={"style": ["observational"], "topic": ["technology"]},
                language="en",
                confidence=0.85,
                model="gpt-4o",
                generation_id="gen-123"
            )
        ]
        mock_ai_service.generate_personalized_jokes.return_value = generated_jokes
        
        # Mock joke creation
        mock_repositories['joke_repo'].create = AsyncMock(
            side_effect=[
                MagicMock(id="ai-joke-1", text="AI generated joke 1", language="en"),
                MagicMock(id="ai-joke-2", text="AI generated joke 2", language="en")
            ]
        )
        
        # Mock tag operations
        mock_repositories['tag_repo'].get_tags_by_category = AsyncMock(
            return_value=[MagicMock(id="tag1", value="observational")]
        )
        mock_repositories['tag_repo'].add_joke_tag = AsyncMock()
        
        # Get fallback recommendations
        result = await personalization_service._get_fallback_recommendations(
            user_id="test-user",
            limit=3,
            language="en"
        )
        
        # Assertions
        assert len(result.jokes) == 3
        assert result.strategy_breakdown['fallback'] == 1
        assert result.strategy_breakdown['ai_generated'] == 2
        assert result.performance_metrics['ai_fallback'] is True
        
        # Verify AI service was called
        mock_ai_service.generate_personalized_jokes.assert_called_once()
        call_args = mock_ai_service.generate_personalized_jokes.call_args
        assert call_args.kwargs['user_id'] == "test-user"
        assert call_args.kwargs['language'] == "en"
        assert call_args.kwargs['count'] == 2  # 3 requested - 1 trending

    @pytest.mark.asyncio
    async def test_fallback_uses_generic_ai_without_preferences(
        self, personalization_service, mock_repositories, mock_ai_service
    ):
        """Test AI generates generic jokes when user has no preferences."""
        # Mock no trending jokes
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(return_value=[])
        
        # Mock no user preferences
        mock_repositories['tag_repo'].get_user_tag_scores = AsyncMock(return_value=[])
        
        # Mock generic AI generation
        generated_jokes = [
            GeneratedJoke(
                text="Generic AI joke",
                tags={"style": ["one_liner"], "tone": ["lighthearted"]},
                language="en",
                confidence=0.8,
                model="gpt-4o",
                generation_id="gen-456"
            )
        ]
        mock_ai_service.generate_fallback_jokes.return_value = generated_jokes
        
        # Mock joke creation
        mock_repositories['joke_repo'].create = AsyncMock(
            return_value=MagicMock(id="generic-joke-1", text="Generic AI joke", language="en")
        )
        
        # Mock tag operations
        mock_repositories['tag_repo'].get_tags_by_category = AsyncMock(return_value=[])
        
        # Get fallback recommendations
        result = await personalization_service._get_fallback_recommendations(
            user_id="test-user",
            limit=1,
            language="en"
        )
        
        # Assertions
        assert len(result.jokes) == 1
        assert result.strategy_breakdown['ai_generated'] == 1
        
        # Verify generic fallback was called
        mock_ai_service.generate_fallback_jokes.assert_called_once()
        mock_ai_service.generate_personalized_jokes.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_respects_cooldown(
        self, personalization_service, mock_repositories
    ):
        """Test AI generation respects cooldown period."""
        # Set recent generation time
        personalization_service._last_ai_generation["test-user"] = datetime.utcnow()
        
        # Mock insufficient jokes
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(return_value=[])
        
        # Get fallback recommendations
        result = await personalization_service._get_fallback_recommendations(
            user_id="test-user",
            limit=5,
            language="en"
        )
        
        # Should not generate AI jokes due to cooldown
        assert len(result.jokes) == 0
        assert 'ai_generated' not in result.strategy_breakdown

    @pytest.mark.asyncio
    async def test_fallback_handles_ai_generation_error(
        self, personalization_service, mock_repositories, mock_ai_service
    ):
        """Test fallback handles AI generation errors gracefully."""
        # Mock one trending joke
        trending_joke = MagicMock(id="joke1", text="Trending joke")
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(
            return_value=[trending_joke]
        )
        
        # Mock AI generation error
        mock_ai_service.generate_fallback_jokes.side_effect = Exception("AI API error")
        
        # Get fallback recommendations
        result = await personalization_service._get_fallback_recommendations(
            user_id="test-user",
            limit=5,
            language="en"
        )
        
        # Should return only trending jokes
        assert len(result.jokes) == 1
        assert result.jokes[0][0] == trending_joke
        assert result.strategy_breakdown == {'fallback': 1}

    @pytest.mark.asyncio
    async def test_fallback_without_ai_service(self, mock_repositories):
        """Test fallback works without AI service."""
        # Create service without AI
        service = PersonalizationService(
            personalization_repo=mock_repositories['personalization_repo'],
            tag_repo=mock_repositories['tag_repo'],
            joke_repo=mock_repositories['joke_repo'],
            ai_joke_service=None
        )
        
        # Mock trending jokes
        trending_jokes = [
            MagicMock(id=f"joke{i}", text=f"Trending joke {i}")
            for i in range(5)
        ]
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(
            return_value=trending_jokes
        )
        
        # Get fallback recommendations
        result = await service._get_fallback_recommendations(
            user_id="test-user",
            limit=5,
            language="en"
        )
        
        # Should return only trending jokes
        assert len(result.jokes) == 5
        assert all(j[2] == 'fallback' for j in result.jokes)


class TestCooldownManagement:
    """Test AI generation cooldown management."""

    @pytest.mark.asyncio
    async def test_can_generate_ai_jokes_no_history(self, personalization_service):
        """Test cooldown check with no generation history."""
        can_generate = await personalization_service._can_generate_ai_jokes("new-user")
        assert can_generate is True

    @pytest.mark.asyncio
    async def test_can_generate_ai_jokes_in_cooldown(self, personalization_service):
        """Test cooldown check during cooldown period."""
        # Set recent generation
        personalization_service._last_ai_generation["test-user"] = datetime.utcnow()
        
        can_generate = await personalization_service._can_generate_ai_jokes("test-user")
        assert can_generate is False

    @pytest.mark.asyncio
    async def test_can_generate_ai_jokes_after_cooldown(self, personalization_service):
        """Test cooldown check after cooldown period."""
        # Set generation time beyond cooldown
        past_time = datetime.utcnow() - timedelta(minutes=10)
        personalization_service._last_ai_generation["test-user"] = past_time
        
        can_generate = await personalization_service._can_generate_ai_jokes("test-user")
        assert can_generate is True


class TestAIJokeStorage:
    """Test AI-generated joke storage in fallback."""

    @pytest.mark.asyncio
    async def test_stores_ai_jokes_with_tags(
        self, personalization_service, mock_repositories, mock_ai_service
    ):
        """Test AI-generated jokes are stored with proper tags."""
        # Setup mocks
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(return_value=[])
        mock_repositories['tag_repo'].get_user_tag_scores = AsyncMock(return_value=[])
        
        # Mock AI generation
        generated_joke = GeneratedJoke(
            text="AI joke with tags",
            tags={
                "style": ["observational"],
                "format": ["setup_punchline"],
                "topic": ["technology"],
                "tone": ["witty"]
            },
            language="en",
            confidence=0.9,
            model="gpt-4o",
            generation_id="gen-789"
        )
        mock_ai_service.generate_fallback_jokes.return_value = [generated_joke]
        
        # Mock joke creation
        created_joke = MagicMock(id="stored-joke-1", text="AI joke with tags", language="en")
        mock_repositories['joke_repo'].create = AsyncMock(return_value=created_joke)
        
        # Mock tags
        mock_tags = {
            "style": [MagicMock(id="tag-style-1", value="observational")],
            "format": [MagicMock(id="tag-format-1", value="setup_punchline")],
            "topic": [MagicMock(id="tag-topic-1", value="technology")],
            "tone": [MagicMock(id="tag-tone-1", value="witty")]
        }
        
        def get_tags_by_category(category):
            return mock_tags.get(category, [])
        
        mock_repositories['tag_repo'].get_tags_by_category = AsyncMock(
            side_effect=get_tags_by_category
        )
        mock_repositories['tag_repo'].add_joke_tag = AsyncMock()
        
        # Get fallback recommendations
        result = await personalization_service._get_fallback_recommendations(
            user_id="test-user",
            limit=1,
            language="en"
        )
        
        # Verify joke was created
        mock_repositories['joke_repo'].create.assert_called_once_with(
            text="AI joke with tags",
            language="en",
            source="ai_generated"
        )
        
        # Verify tags were added
        assert mock_repositories['tag_repo'].add_joke_tag.call_count == 4
        
        # Check each tag was added with correct confidence
        for call in mock_repositories['tag_repo'].add_joke_tag.call_args_list:
            assert call.kwargs['joke_id'] == "stored-joke-1"
            assert call.kwargs['confidence'] == 0.9


class TestRecommendationWithAI:
    """Test main recommendation flow with AI integration."""

    @pytest.mark.asyncio
    async def test_get_personalized_recommendations_with_ai_fallback(
        self, personalization_service, mock_repositories, mock_ai_service
    ):
        """Test personalized recommendations falls back to AI when needed."""
        # Mock empty content recommendations
        mock_repositories['personalization_repo'].get_personalized_recommendations = AsyncMock(
            return_value=[]
        )
        
        # Mock empty collaborative recommendations
        mock_repositories['personalization_repo'].get_similar_users_recommendations = AsyncMock(
            return_value=[]
        )
        
        # This should trigger fallback with AI
        # Mock trending jokes (insufficient)
        mock_repositories['joke_repo'].get_trending_jokes = AsyncMock(return_value=[])
        
        # Mock AI generation
        generated_joke = GeneratedJoke(
            text="AI fallback joke",
            tags={"style": ["one_liner"]},
            language="en",
            confidence=0.8,
            model="gpt-4o",
            generation_id="gen-fallback"
        )
        mock_ai_service.generate_fallback_jokes.return_value = [generated_joke]
        
        # Mock joke creation
        mock_repositories['joke_repo'].create = AsyncMock(
            return_value=MagicMock(id="fallback-1", text="AI fallback joke", language="en")
        )
        
        # Mock tag operations
        mock_repositories['tag_repo'].get_tags_by_category = AsyncMock(return_value=[])
        mock_repositories['tag_repo'].get_user_tag_scores = AsyncMock(return_value=[])
        
        # Get recommendations
        result = await personalization_service.get_personalized_recommendations(
            user_id="test-user",
            limit=1,
            language="en"
        )
        
        # Should have AI-generated fallback
        assert len(result.jokes) == 1
        assert 'ai_generated' in result.strategy_breakdown