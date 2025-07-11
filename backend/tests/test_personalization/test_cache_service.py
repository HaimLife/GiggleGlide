"""Tests for cache service functionality."""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from services.cache_service import CacheService
from services.personalization_service import RecommendationResult
from database.models import Tag, UserTagScore


class TestCacheService:
    """Test suite for CacheService."""

    @pytest.fixture
    def cache_service(self):
        """Create a cache service instance with memory fallback."""
        # Use memory fallback for testing (no Redis required)
        with patch('redis.from_url') as mock_redis:
            mock_redis.side_effect = Exception("Redis not available")
            service = CacheService()
            return service

    @pytest.fixture
    def sample_preferences(self):
        """Create sample user preferences."""
        return [
            UserTagScore(
                tag_id="tag1",
                score=0.8,
                interaction_count=10,
                last_updated=datetime.utcnow()
            ),
            UserTagScore(
                tag_id="tag2", 
                score=0.6,
                interaction_count=5,
                last_updated=datetime.utcnow()
            )
        ]

    @pytest.fixture
    def sample_tags(self):
        """Create sample tags."""
        return [
            Tag(
                id="tag1",
                name="Observational", 
                category="style",
                value="observational",
                description="Observational comedy"
            ),
            Tag(
                id="tag2",
                name="Witty",
                category="tone", 
                value="witty",
                description="Clever humor"
            )
        ]

    async def test_cache_and_get_user_preferences(self, cache_service, sample_preferences):
        """Test caching and retrieving user preferences."""
        user_id = "user123"
        
        # Cache preferences
        success = await cache_service.cache_user_preferences(
            user_id=user_id,
            preferences=sample_preferences,
            ttl=3600
        )
        assert success is True
        
        # Retrieve preferences
        cached_prefs = await cache_service.get_user_preferences(user_id)
        assert cached_prefs is not None
        assert len(cached_prefs) == 2
        
        # Verify data structure
        for pref in cached_prefs:
            assert 'tag_id' in pref
            assert 'score' in pref
            assert 'interaction_count' in pref
            assert 'last_updated' in pref

    async def test_cache_user_preferences_with_none_values(self, cache_service):
        """Test caching preferences with None values."""
        user_id = "user123"
        preferences = [
            UserTagScore(
                tag_id="tag1",
                score=0.5,
                interaction_count=3,
                last_updated=None  # None value
            )
        ]
        
        success = await cache_service.cache_user_preferences(
            user_id=user_id,
            preferences=preferences
        )
        assert success is True
        
        cached_prefs = await cache_service.get_user_preferences(user_id)
        assert cached_prefs is not None
        assert cached_prefs[0]['last_updated'] is None

    async def test_get_nonexistent_user_preferences(self, cache_service):
        """Test retrieving preferences for non-existent user."""
        cached_prefs = await cache_service.get_user_preferences("nonexistent_user")
        assert cached_prefs is None

    async def test_cache_and_get_recommendations(self, cache_service):
        """Test caching and retrieving recommendations."""
        user_id = "user123"
        context = {"language": "en", "limit": 10}
        
        # Create mock recommendation result
        recommendations = RecommendationResult(
            jokes=[],  # Empty for simplicity
            strategy_breakdown={"exploit": 7, "explore": 3},
            performance_metrics={"processing_time": 0.1},
            cache_hit=False
        )
        
        # Cache recommendations
        success = await cache_service.cache_recommendations(
            user_id=user_id,
            recommendations=recommendations,
            context=context,
            ttl=300
        )
        assert success is True
        
        # Retrieve recommendations
        cached_recs = await cache_service.get_cached_recommendations(user_id, context)
        assert cached_recs is not None
        assert 'jokes' in cached_recs
        assert 'strategy_breakdown' in cached_recs
        assert 'performance_metrics' in cached_recs
        assert 'cached_at' in cached_recs
        assert cached_recs['context'] == context

    async def test_cache_recommendations_different_contexts(self, cache_service):
        """Test that different contexts create separate cache entries."""
        user_id = "user123"
        context1 = {"language": "en", "limit": 10}
        context2 = {"language": "es", "limit": 5}
        
        recommendations = RecommendationResult(
            jokes=[],
            strategy_breakdown={"exploit": 5},
            performance_metrics={},
            cache_hit=False
        )
        
        # Cache with different contexts
        await cache_service.cache_recommendations(user_id, recommendations, context1)
        await cache_service.cache_recommendations(user_id, recommendations, context2)
        
        # Should retrieve different entries
        cached_recs1 = await cache_service.get_cached_recommendations(user_id, context1)
        cached_recs2 = await cache_service.get_cached_recommendations(user_id, context2)
        
        assert cached_recs1 is not None
        assert cached_recs2 is not None
        assert cached_recs1['context'] != cached_recs2['context']

    async def test_cache_and_get_hot_jokes(self, cache_service):
        """Test caching and retrieving hot jokes."""
        joke_ids = ["joke1", "joke2", "joke3"]
        category = "trending"
        
        # Cache hot jokes
        success = await cache_service.cache_hot_jokes(
            joke_ids=joke_ids,
            category=category,
            ttl=1800
        )
        assert success is True
        
        # Retrieve hot jokes
        cached_jokes = await cache_service.get_hot_jokes(category)
        assert cached_jokes == joke_ids

    async def test_cache_and_get_tags(self, cache_service, sample_tags):
        """Test caching and retrieving tags."""
        category = "style"
        
        # Cache tags
        success = await cache_service.cache_tags(
            tags=sample_tags,
            category=category,
            ttl=7200
        )
        assert success is True
        
        # Retrieve tags
        cached_tags = await cache_service.get_cached_tags(category)
        assert cached_tags is not None
        assert len(cached_tags) == 2
        
        # Verify tag structure
        for tag in cached_tags:
            assert 'id' in tag
            assert 'name' in tag
            assert 'category' in tag
            assert 'value' in tag
            assert 'description' in tag

    async def test_cache_user_session(self, cache_service):
        """Test caching and retrieving user session data."""
        user_id = "user123"
        session_data = {
            "last_active": datetime.utcnow().isoformat(),
            "session_id": "session123",
            "preferences_updated": True
        }
        
        # Cache session
        success = await cache_service.cache_user_session(
            user_id=user_id,
            session_data=session_data,
            ttl=3600
        )
        assert success is True
        
        # Retrieve session
        cached_session = await cache_service.get_user_session(user_id)
        assert cached_session == session_data

    async def test_invalidate_user_cache(self, cache_service, sample_preferences):
        """Test invalidating all cache entries for a user."""
        user_id = "user123"
        
        # Cache multiple types of data for the user
        await cache_service.cache_user_preferences(user_id, sample_preferences)
        await cache_service.cache_user_session(user_id, {"test": "data"})
        
        # Verify data is cached
        assert await cache_service.get_user_preferences(user_id) is not None
        assert await cache_service.get_user_session(user_id) is not None
        
        # Invalidate cache
        success = await cache_service.invalidate_user_cache(user_id)
        assert success is True
        
        # Verify data is removed
        assert await cache_service.get_user_preferences(user_id) is None
        assert await cache_service.get_user_session(user_id) is None

    async def test_cache_expiration(self, cache_service):
        """Test cache expiration in memory fallback."""
        user_id = "user123"
        session_data = {"test": "data"}
        
        # Cache with very short TTL
        await cache_service.cache_user_session(
            user_id=user_id,
            session_data=session_data,
            ttl=1
        )
        
        # Should be available immediately
        cached_data = await cache_service.get_user_session(user_id)
        assert cached_data == session_data
        
        # Manually expire the cache
        import time
        time.sleep(1.1)
        
        # Manually trigger cleanup
        cleared_count = await cache_service.clear_expired_cache()
        assert cleared_count >= 0
        
        # Should be expired now
        cached_data = await cache_service.get_user_session(user_id)
        assert cached_data is None

    async def test_get_cache_stats_memory_backend(self, cache_service):
        """Test getting cache statistics for memory backend."""
        # Add some data to cache
        await cache_service.cache_user_session("user1", {"test": "data1"})
        await cache_service.cache_user_session("user2", {"test": "data2"})
        
        stats = await cache_service.get_cache_stats()
        
        assert stats['backend'] == 'memory'
        assert stats['connected'] is True
        assert stats['total_keys'] >= 2
        assert 'entries_with_expiry' in stats

    async def test_key_generation(self, cache_service):
        """Test internal key generation with prefix."""
        key = cache_service._get_key("test_key")
        assert key.startswith(cache_service.key_prefix)
        assert "test_key" in key

    async def test_error_handling_in_cache_operations(self, cache_service):
        """Test error handling in cache operations."""
        # Test with invalid data that can't be JSON serialized
        class NonSerializable:
            pass
        
        # This should handle the error gracefully
        success = await cache_service.cache_user_session(
            user_id="user123",
            session_data={"invalid": NonSerializable()},
            ttl=3600
        )
        # Should return False due to serialization error
        assert success is False

    @patch('redis.from_url')
    async def test_redis_backend_initialization(self, mock_redis_from_url):
        """Test Redis backend initialization."""
        # Mock successful Redis connection
        mock_redis_client = Mock()
        mock_redis_client.ping.return_value = True
        mock_redis_from_url.return_value = mock_redis_client
        
        cache_service = CacheService()
        
        assert cache_service.redis_client == mock_redis_client
        mock_redis_client.ping.assert_called_once()

    @patch('redis.from_url')
    async def test_redis_backend_operations(self, mock_redis_from_url):
        """Test Redis backend operations."""
        # Mock Redis client
        mock_redis_client = Mock()
        mock_redis_client.ping.return_value = True
        mock_redis_client.setex.return_value = True
        mock_redis_client.get.return_value = json.dumps({"test": "data"}).encode()
        mock_redis_from_url.return_value = mock_redis_client
        
        cache_service = CacheService()
        
        # Test caching
        success = await cache_service.cache_user_session(
            user_id="user123",
            session_data={"test": "data"},
            ttl=3600
        )
        assert success is True
        mock_redis_client.setex.assert_called_once()
        
        # Test retrieval
        data = await cache_service.get_user_session("user123")
        assert data == {"test": "data"}
        mock_redis_client.get.assert_called_once()

    async def test_context_hashing_consistency(self, cache_service):
        """Test that same contexts produce same cache keys."""
        context1 = {"language": "en", "limit": 10, "exclude_seen": True}
        context2 = {"limit": 10, "language": "en", "exclude_seen": True}  # Different order
        
        # Both should produce same hash due to sort_keys=True
        hash1 = hash(json.dumps(context1, sort_keys=True))
        hash2 = hash(json.dumps(context2, sort_keys=True))
        
        assert hash1 == hash2

    async def test_concurrent_cache_operations(self, cache_service):
        """Test concurrent cache operations don't interfere."""
        import asyncio
        
        async def cache_user_data(user_id, data):
            return await cache_service.cache_user_session(user_id, data)
        
        # Run concurrent operations
        tasks = [
            cache_user_data(f"user{i}", {"data": i})
            for i in range(5)
        ]
        
        results = await asyncio.gather(*tasks)
        assert all(results)  # All should succeed
        
        # Verify all data is cached correctly
        for i in range(5):
            cached_data = await cache_service.get_user_session(f"user{i}")
            assert cached_data == {"data": i}

    def test_close_connection(self, cache_service):
        """Test closing cache connection."""
        # Should not raise exception even with memory backend
        cache_service.close()
        
        # Test with mock Redis client
        cache_service.redis_client = Mock()
        cache_service.close()
        cache_service.redis_client.close.assert_called_once()