"""Tests for AI Joke Generation Service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
import json

from services.ai_joke_service import (
    AIJokeService, JokeGenerationRequest, GeneratedJoke,
    ModerationResult, CostTracker
)
from database.models import Tag, TagStyle, TagFormat, TagTopic, TagTone


@pytest.fixture
async def mock_joke_repo():
    """Create a mock joke repository."""
    repo = AsyncMock()
    repo.create = AsyncMock(return_value=MagicMock(id="test-joke-id"))
    repo.count_by_language = AsyncMock(return_value=50)
    return repo


@pytest.fixture
async def mock_tag_repo():
    """Create a mock tag repository."""
    repo = AsyncMock()
    
    # Mock tags
    mock_tags = [
        MagicMock(id="tag1", name="observational", value="observational", category="style"),
        MagicMock(id="tag2", name="setup_punchline", value="setup_punchline", category="format"),
        MagicMock(id="tag3", name="technology", value="technology", category="topic"),
        MagicMock(id="tag4", name="lighthearted", value="lighthearted", category="tone")
    ]
    
    repo.get_tags_by_category = AsyncMock(return_value=mock_tags)
    repo.get_all = AsyncMock(return_value=mock_tags)
    repo.add_joke_tag = AsyncMock()
    return repo


@pytest.fixture
async def ai_service(mock_joke_repo, mock_tag_repo):
    """Create AI joke service with mocked dependencies."""
    with patch('services.ai_joke_service.settings') as mock_settings:
        mock_settings.OPENAI_API_KEY = "test-api-key"
        mock_settings.OPENAI_MODEL = "gpt-4o"
        mock_settings.OPENAI_MAX_TOKENS = 200
        mock_settings.OPENAI_TEMPERATURE = 0.8
        mock_settings.AI_COST_TRACKING_ENABLED = True
        mock_settings.AI_MONTHLY_BUDGET_USD = 100.0
        mock_settings.AI_MAX_COST_PER_REQUEST = 0.10
        mock_settings.MODERATION_ENABLED = True
        mock_settings.MODERATION_THRESHOLD_VIOLENCE = 0.7
        mock_settings.MODERATION_THRESHOLD_HATE = 0.5
        mock_settings.MODERATION_THRESHOLD_SELF_HARM = 0.7
        mock_settings.MODERATION_THRESHOLD_SEXUAL = 0.7
        
        service = AIJokeService(mock_joke_repo, mock_tag_repo)
        
        # Mock OpenAI client
        mock_client = AsyncMock()
        service.client = mock_client
        
        return service


class TestJokeGeneration:
    """Test joke generation functionality."""

    @pytest.mark.asyncio
    async def test_generate_jokes_success(self, ai_service):
        """Test successful joke generation."""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "jokes": [
                        {
                            "text": "Why don't programmers like nature? It has too many bugs!",
                            "tags": {
                                "style": ["observational"],
                                "format": ["setup_punchline"],
                                "topic": ["technology"],
                                "tone": ["lighthearted"]
                            },
                            "confidence": 0.9
                        }
                    ]
                })
            )
        )]
        mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=50)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Create request
        request = JokeGenerationRequest(
            tags={
                "style": ["observational"],
                "format": ["setup_punchline"],
                "topic": ["technology"],
                "tone": ["lighthearted"]
            },
            language="en",
            count=1
        )
        
        # Generate jokes
        jokes = await ai_service.generate_jokes(request)
        
        # Assertions
        assert len(jokes) == 1
        assert jokes[0].text == "Why don't programmers like nature? It has too many bugs!"
        assert jokes[0].language == "en"
        assert jokes[0].confidence == 0.9
        assert jokes[0].tags["style"] == ["observational"]
        assert jokes[0].prompt_tokens == 100
        assert jokes[0].completion_tokens == 50

    @pytest.mark.asyncio
    async def test_generate_jokes_no_api_key(self, mock_joke_repo, mock_tag_repo):
        """Test generation fails without API key."""
        with patch('services.ai_joke_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            service = AIJokeService(mock_joke_repo, mock_tag_repo)
            
            request = JokeGenerationRequest(tags={}, language="en", count=1)
            
            with pytest.raises(ValueError, match="OpenAI client not initialized"):
                await service.generate_jokes(request)

    @pytest.mark.asyncio
    async def test_generate_jokes_budget_exceeded(self, ai_service):
        """Test generation blocked when budget exceeded."""
        # Set high monthly total to exceed budget
        ai_service.cost_tracker.monthly_total = 99.99
        
        request = JokeGenerationRequest(tags={}, language="en", count=10)
        
        with pytest.raises(ValueError, match="AI generation budget exceeded"):
            await service.generate_jokes(request)

    @pytest.mark.asyncio
    async def test_generate_jokes_parse_error(self, ai_service):
        """Test handling of JSON parse errors."""
        # Mock invalid JSON response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(content="Invalid JSON")
        )]
        mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=50)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        request = JokeGenerationRequest(tags={}, language="en", count=1)
        jokes = await ai_service.generate_jokes(request)
        
        # Should return empty list on parse error
        assert len(jokes) == 0


class TestModeration:
    """Test content moderation functionality."""

    @pytest.mark.asyncio
    async def test_moderate_content_safe(self, ai_service):
        """Test moderation of safe content."""
        # Mock moderation response
        mock_result = MagicMock()
        mock_result.category_scores = MagicMock(
            violence=0.1,
            hate=0.1,
            self_harm=0.1,
            sexual=0.1
        )
        
        mock_response = MagicMock()
        mock_response.results = [mock_result]
        
        ai_service.client.moderations.create = AsyncMock(return_value=mock_response)
        
        result = await ai_service.moderate_content("A harmless joke about pizza")
        
        assert result.safe is True
        assert len(result.flagged_categories) == 0
        assert result.scores["violence"] == 0.1

    @pytest.mark.asyncio
    async def test_moderate_content_unsafe(self, ai_service):
        """Test moderation of unsafe content."""
        # Mock moderation response with high scores
        mock_result = MagicMock()
        mock_result.category_scores = MagicMock(
            violence=0.8,  # Above threshold
            hate=0.6,      # Above threshold
            self_harm=0.1,
            sexual=0.1
        )
        
        mock_response = MagicMock()
        mock_response.results = [mock_result]
        
        ai_service.client.moderations.create = AsyncMock(return_value=mock_response)
        
        result = await ai_service.moderate_content("Inappropriate content")
        
        assert result.safe is False
        assert "violence" in result.flagged_categories
        assert "hate" in result.flagged_categories
        assert result.scores["violence"] == 0.8

    @pytest.mark.asyncio
    async def test_moderate_content_disabled(self, ai_service):
        """Test moderation when disabled."""
        with patch('services.ai_joke_service.settings.MODERATION_ENABLED', False):
            result = await ai_service.moderate_content("Any content")
            
            assert result.safe is True
            assert len(result.flagged_categories) == 0

    @pytest.mark.asyncio
    async def test_moderate_content_error(self, ai_service):
        """Test moderation error handling."""
        ai_service.client.moderations.create = AsyncMock(
            side_effect=Exception("API error")
        )
        
        result = await ai_service.moderate_content("Test content")
        
        # Should return unsafe on error
        assert result.safe is False
        assert "error" in result.flagged_categories


class TestPersonalizedGeneration:
    """Test personalized joke generation."""

    @pytest.mark.asyncio
    async def test_generate_personalized_jokes(self, ai_service):
        """Test personalized joke generation."""
        # Mock successful generation and moderation
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "jokes": [
                        {
                            "text": "Personalized tech joke",
                            "tags": {"topic": ["technology"]},
                            "confidence": 0.9
                        }
                    ]
                })
            )
        )]
        mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=50)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Mock safe moderation
        mock_mod_result = MagicMock()
        mock_mod_result.category_scores = MagicMock(
            violence=0.1, hate=0.1, self_harm=0.1, sexual=0.1
        )
        ai_service.client.moderations.create = AsyncMock(
            return_value=MagicMock(results=[mock_mod_result])
        )
        
        # Generate personalized jokes
        user_tags = {
            "topic": [("technology", 0.8), ("science", 0.6)],
            "tone": [("witty", 0.7)]
        }
        
        jokes = await ai_service.generate_personalized_jokes(
            user_id="test-user",
            user_tags=user_tags,
            language="en",
            count=1
        )
        
        assert len(jokes) == 1
        assert jokes[0].text == "Personalized tech joke"

    @pytest.mark.asyncio
    async def test_generate_personalized_jokes_filters_unsafe(self, ai_service):
        """Test that unsafe jokes are filtered out."""
        # Mock generation of multiple jokes
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "jokes": [
                        {"text": "Safe joke", "tags": {}, "confidence": 0.9},
                        {"text": "Unsafe joke", "tags": {}, "confidence": 0.9}
                    ]
                })
            )
        )]
        mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=100)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Mock moderation - first safe, second unsafe
        safe_result = MagicMock()
        safe_result.category_scores = MagicMock(
            violence=0.1, hate=0.1, self_harm=0.1, sexual=0.1
        )
        
        unsafe_result = MagicMock()
        unsafe_result.category_scores = MagicMock(
            violence=0.8, hate=0.1, self_harm=0.1, sexual=0.1
        )
        
        ai_service.client.moderations.create = AsyncMock(
            side_effect=[
                MagicMock(results=[safe_result]),
                MagicMock(results=[unsafe_result])
            ]
        )
        
        jokes = await ai_service.generate_personalized_jokes(
            user_id="test-user",
            user_tags={},
            language="en",
            count=2
        )
        
        # Only safe joke should be returned
        assert len(jokes) == 1
        assert jokes[0].text == "Safe joke"


class TestFallbackGeneration:
    """Test fallback joke generation."""

    @pytest.mark.asyncio
    async def test_generate_fallback_jokes(self, ai_service):
        """Test fallback joke generation with safe defaults."""
        # Mock successful generation
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "jokes": [
                        {
                            "text": "Generic fallback joke",
                            "tags": {
                                "style": ["observational"],
                                "tone": ["lighthearted"]
                            },
                            "confidence": 0.9
                        }
                    ]
                })
            )
        )]
        mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=50)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        jokes = await ai_service.generate_fallback_jokes(language="en", count=1)
        
        assert len(jokes) == 1
        assert jokes[0].text == "Generic fallback joke"
        assert "observational" in jokes[0].tags.get("style", [])


class TestBatchGeneration:
    """Test batch generation and storage."""

    @pytest.mark.asyncio
    async def test_batch_generate_and_store(self, ai_service, mock_joke_repo, mock_tag_repo):
        """Test batch generation and storage."""
        # Mock successful generation
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "jokes": [
                        {
                            "text": "Batch joke 1",
                            "tags": {"style": ["observational"]},
                            "confidence": 0.9
                        },
                        {
                            "text": "Batch joke 2",
                            "tags": {"style": ["wordplay"]},
                            "confidence": 0.8
                        }
                    ]
                })
            )
        )]
        mock_response.usage = MagicMock(prompt_tokens=200, completion_tokens=100)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Mock safe moderation
        safe_result = MagicMock()
        safe_result.category_scores = MagicMock(
            violence=0.1, hate=0.1, self_harm=0.1, sexual=0.1
        )
        ai_service.client.moderations.create = AsyncMock(
            return_value=MagicMock(results=[safe_result])
        )
        
        # Create batch requests
        requests = [
            JokeGenerationRequest(
                tags={"style": ["observational"]},
                language="en",
                count=2
            )
        ]
        
        result = await ai_service.batch_generate_and_store(requests)
        
        assert result["total_requested"] == 2
        assert result["total_generated"] == 2
        assert result["total_stored"] == 2
        assert result["total_moderated"] == 2
        assert result["total_cost"] > 0
        assert len(result["errors"]) == 0

    @pytest.mark.asyncio
    async def test_batch_generate_with_unsafe_content(self, ai_service, mock_joke_repo):
        """Test batch generation filters unsafe content."""
        # Mock generation
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content=json.dumps({
                    "jokes": [
                        {"text": "Safe joke", "tags": {}, "confidence": 0.9},
                        {"text": "Unsafe joke", "tags": {}, "confidence": 0.9}
                    ]
                })
            )
        )]
        mock_response.usage = MagicMock(prompt_tokens=200, completion_tokens=100)
        
        ai_service.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Mock moderation - alternate safe/unsafe
        safe_result = MagicMock()
        safe_result.category_scores = MagicMock(
            violence=0.1, hate=0.1, self_harm=0.1, sexual=0.1
        )
        
        unsafe_result = MagicMock()
        unsafe_result.category_scores = MagicMock(
            violence=0.8, hate=0.1, self_harm=0.1, sexual=0.1
        )
        
        ai_service.client.moderations.create = AsyncMock(
            side_effect=[
                MagicMock(results=[safe_result]),
                MagicMock(results=[unsafe_result])
            ]
        )
        
        requests = [JokeGenerationRequest(tags={}, language="en", count=2)]
        
        result = await ai_service.batch_generate_and_store(requests)
        
        assert result["total_generated"] == 2
        assert result["total_moderated"] == 2
        assert result["total_stored"] == 1  # Only safe joke stored


class TestCostTracking:
    """Test cost tracking functionality."""

    def test_calculate_cost(self, ai_service):
        """Test cost calculation."""
        # Test GPT-4o pricing
        cost = ai_service._calculate_cost(1000, 500)  # 1K input, 0.5K output
        expected = (1000/1000 * 0.005) + (500/1000 * 0.015)
        assert cost == expected

    @pytest.mark.asyncio
    async def test_check_cost_limits_under_budget(self, ai_service):
        """Test cost limits when under budget."""
        ai_service.cost_tracker.monthly_total = 50.0
        
        # Should allow request under budget
        allowed = await ai_service._check_cost_limits(5)
        assert allowed is True

    @pytest.mark.asyncio
    async def test_check_cost_limits_over_budget(self, ai_service):
        """Test cost limits when over budget."""
        ai_service.cost_tracker.monthly_total = 99.0
        
        # Should block request that would exceed budget
        allowed = await ai_service._check_cost_limits(20)  # Would exceed $100 budget
        assert allowed is False

    @pytest.mark.asyncio
    async def test_check_cost_limits_per_request(self, ai_service):
        """Test per-request cost limit."""
        with patch('services.ai_joke_service.settings.AI_MAX_COST_PER_REQUEST', 0.01):
            # Request that would exceed per-request limit
            allowed = await ai_service._check_cost_limits(100)
            assert allowed is False

    @pytest.mark.asyncio
    async def test_update_cost_tracking(self, ai_service):
        """Test cost tracking updates."""
        initial_daily = ai_service.cost_tracker.daily_total
        initial_monthly = ai_service.cost_tracker.monthly_total
        
        await ai_service._update_cost_tracking(0.05)
        
        assert ai_service.cost_tracker.daily_total == initial_daily + 0.05
        assert ai_service.cost_tracker.monthly_total == initial_monthly + 0.05
        assert ai_service.cost_tracker.requests_today == 1
        assert ai_service.cost_tracker.requests_month == 1

    def test_get_cost_summary(self, ai_service):
        """Test cost summary generation."""
        ai_service.cost_tracker.daily_total = 5.0
        ai_service.cost_tracker.monthly_total = 50.0
        ai_service.cost_tracker.requests_today = 10
        ai_service.cost_tracker.requests_month = 100
        
        summary = ai_service.get_cost_summary()
        
        assert summary["daily_total"] == 5.0
        assert summary["monthly_total"] == 50.0
        assert summary["requests_today"] == 10
        assert summary["requests_month"] == 100
        assert summary["budget_remaining"] == 50.0  # 100 - 50


class TestPromptBuilding:
    """Test prompt building functionality."""

    def test_build_generation_prompt_with_tags(self, ai_service):
        """Test prompt building with specific tags."""
        request = JokeGenerationRequest(
            tags={
                "style": ["observational", "wordplay"],
                "format": ["setup_punchline"],
                "topic": ["technology"],
                "tone": ["witty"]
            },
            language="en",
            count=3
        )
        
        prompt = ai_service._build_generation_prompt(request)
        
        assert "Generate 3 original joke(s)" in prompt
        assert "Style: observational, wordplay" in prompt
        assert "Format: setup_punchline" in prompt
        assert "Topics: technology" in prompt
        assert "Tone: witty" in prompt
        assert "Language: English" in prompt

    def test_build_generation_prompt_no_tags(self, ai_service):
        """Test prompt building without tags."""
        request = JokeGenerationRequest(tags={}, language="es", count=1)
        
        prompt = ai_service._build_generation_prompt(request)
        
        assert "Generate 1 original joke(s)" in prompt
        assert "General humor" in prompt
        assert "Language: Spanish" in prompt

    def test_get_system_prompt(self, ai_service):
        """Test system prompt generation."""
        prompt = ai_service._get_system_prompt("fr")
        
        assert "professional comedy writer" in prompt
        assert "GiggleGlide app" in prompt
        assert "French language" in prompt
        assert "return valid JSON" in prompt

    def test_get_language_name(self, ai_service):
        """Test language name conversion."""
        assert ai_service._get_language_name("en") == "English"
        assert ai_service._get_language_name("es") == "Spanish"
        assert ai_service._get_language_name("fr") == "French"
        assert ai_service._get_language_name("unknown") == "English"  # Default


class TestStoreGeneratedJoke:
    """Test joke storage functionality."""

    @pytest.mark.asyncio
    async def test_store_generated_joke_success(self, ai_service, mock_joke_repo, mock_tag_repo):
        """Test successful joke storage."""
        generated_joke = GeneratedJoke(
            text="Test joke",
            tags={"style": ["observational"]},
            language="en",
            confidence=0.9,
            model="gpt-4o",
            generation_id="gen-123"
        )
        
        joke_id = await ai_service._store_generated_joke(generated_joke)
        
        assert joke_id == "test-joke-id"
        mock_joke_repo.create.assert_called_once()
        mock_tag_repo.add_joke_tag.assert_called()

    @pytest.mark.asyncio
    async def test_store_generated_joke_error(self, ai_service, mock_joke_repo):
        """Test joke storage error handling."""
        mock_joke_repo.create.side_effect = Exception("Database error")
        
        generated_joke = GeneratedJoke(
            text="Test joke",
            tags={},
            language="en",
            confidence=0.9,
            model="gpt-4o",
            generation_id="gen-123"
        )
        
        joke_id = await ai_service._store_generated_joke(generated_joke)
        
        assert joke_id is None  # Should return None on error