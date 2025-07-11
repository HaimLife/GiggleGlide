"""Redis caching service for personalization system."""

import redis
import json
import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import pickle
from dataclasses import asdict

from ..database.models import Joke, Tag, UserTagScore
from .personalization_service import RecommendationResult

logger = logging.getLogger(__name__)


class CacheService:
    """Redis-based caching service for personalization system."""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        key_prefix: str = "giggleslide:",
        default_ttl: int = 3600  # 1 hour
    ):
        try:
            self.redis_client = redis.from_url(redis_url, decode_responses=False)
            self.key_prefix = key_prefix
            self.default_ttl = default_ttl
            
            # Test connection
            self.redis_client.ping()
            logger.info("Connected to Redis cache")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            # Fallback to in-memory cache
            self.redis_client = None
            self._memory_cache = {}
            self._cache_expiry = {}

    def _get_key(self, key: str) -> str:
        """Get full cache key with prefix."""
        return f"{self.key_prefix}{key}"

    # User Preferences Caching

    async def cache_user_preferences(
        self,
        user_id: str,
        preferences: List[UserTagScore],
        ttl: Optional[int] = None
    ) -> bool:
        """
        Cache user tag preferences.
        
        Args:
            user_id: User ID
            preferences: List of UserTagScore objects
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully
        """
        try:
            key = self._get_key(f"user_prefs:{user_id}")
            
            # Convert preferences to serializable format
            prefs_data = []
            for pref in preferences:
                prefs_data.append({
                    'tag_id': pref.tag_id,
                    'score': pref.score,
                    'interaction_count': pref.interaction_count,
                    'last_updated': pref.last_updated.isoformat() if pref.last_updated else None
                })
            
            if self.redis_client:
                data = json.dumps(prefs_data)
                ttl = ttl or self.default_ttl
                self.redis_client.setex(key, ttl, data)
            else:
                # Fallback to memory cache
                self._memory_cache[key] = prefs_data
                self._cache_expiry[key] = datetime.utcnow() + timedelta(seconds=ttl or self.default_ttl)
            
            logger.debug(f"Cached preferences for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error caching user preferences: {str(e)}")
            return False

    async def get_user_preferences(self, user_id: str) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached user preferences.
        
        Args:
            user_id: User ID
            
        Returns:
            List of preference dictionaries or None if not cached
        """
        try:
            key = self._get_key(f"user_prefs:{user_id}")
            
            if self.redis_client:
                data = self.redis_client.get(key)
                if data:
                    return json.loads(data)
            else:
                # Check memory cache
                if key in self._memory_cache:
                    expiry = self._cache_expiry.get(key, datetime.min)
                    if datetime.utcnow() < expiry:
                        return self._memory_cache[key]
                    else:
                        # Cleanup expired
                        del self._memory_cache[key]
                        if key in self._cache_expiry:
                            del self._cache_expiry[key]
            
            return None

        except Exception as e:
            logger.error(f"Error getting cached user preferences: {str(e)}")
            return None

    # Recommendation Caching

    async def cache_recommendations(
        self,
        user_id: str,
        recommendations: RecommendationResult,
        context: Dict[str, Any],
        ttl: int = 300  # 5 minutes
    ) -> bool:
        """
        Cache personalized recommendations.
        
        Args:
            user_id: User ID
            recommendations: RecommendationResult object
            context: Context used for recommendations (language, filters, etc.)
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully
        """
        try:
            # Create cache key based on user and context
            context_hash = hash(json.dumps(context, sort_keys=True))
            key = self._get_key(f"recommendations:{user_id}:{context_hash}")
            
            # Serialize recommendations
            cache_data = {
                'jokes': [
                    {
                        'joke_id': joke.id,
                        'score': score,
                        'strategy': strategy,
                        'text': joke.text,
                        'category': joke.category,
                        'rating': joke.rating
                    }
                    for joke, score, strategy in recommendations.jokes
                ],
                'strategy_breakdown': recommendations.strategy_breakdown,
                'performance_metrics': recommendations.performance_metrics,
                'cached_at': datetime.utcnow().isoformat(),
                'context': context
            }
            
            if self.redis_client:
                data = json.dumps(cache_data)
                self.redis_client.setex(key, ttl, data)
            else:
                # Fallback to memory cache
                self._memory_cache[key] = cache_data
                self._cache_expiry[key] = datetime.utcnow() + timedelta(seconds=ttl)
            
            logger.debug(f"Cached recommendations for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error caching recommendations: {str(e)}")
            return False

    async def get_cached_recommendations(
        self,
        user_id: str,
        context: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached recommendations.
        
        Args:
            user_id: User ID
            context: Context for recommendations
            
        Returns:
            Cached recommendation data or None
        """
        try:
            context_hash = hash(json.dumps(context, sort_keys=True))
            key = self._get_key(f"recommendations:{user_id}:{context_hash}")
            
            if self.redis_client:
                data = self.redis_client.get(key)
                if data:
                    return json.loads(data)
            else:
                # Check memory cache
                if key in self._memory_cache:
                    expiry = self._cache_expiry.get(key, datetime.min)
                    if datetime.utcnow() < expiry:
                        return self._memory_cache[key]
                    else:
                        # Cleanup expired
                        del self._memory_cache[key]
                        if key in self._cache_expiry:
                            del self._cache_expiry[key]
            
            return None

        except Exception as e:
            logger.error(f"Error getting cached recommendations: {str(e)}")
            return None

    # Hot Jokes Caching

    async def cache_hot_jokes(
        self,
        joke_ids: List[str],
        category: str = "trending",
        ttl: int = 1800  # 30 minutes
    ) -> bool:
        """
        Cache list of hot/trending joke IDs.
        
        Args:
            joke_ids: List of joke IDs
            category: Category of hot jokes (trending, popular, etc.)
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully
        """
        try:
            key = self._get_key(f"hot_jokes:{category}")
            
            cache_data = {
                'joke_ids': joke_ids,
                'cached_at': datetime.utcnow().isoformat(),
                'category': category
            }
            
            if self.redis_client:
                data = json.dumps(cache_data)
                self.redis_client.setex(key, ttl, data)
            else:
                # Fallback to memory cache
                self._memory_cache[key] = cache_data
                self._cache_expiry[key] = datetime.utcnow() + timedelta(seconds=ttl)
            
            logger.debug(f"Cached {len(joke_ids)} hot jokes for category {category}")
            return True

        except Exception as e:
            logger.error(f"Error caching hot jokes: {str(e)}")
            return False

    async def get_hot_jokes(self, category: str = "trending") -> Optional[List[str]]:
        """
        Get cached hot joke IDs.
        
        Args:
            category: Category of hot jokes
            
        Returns:
            List of joke IDs or None if not cached
        """
        try:
            key = self._get_key(f"hot_jokes:{category}")
            
            if self.redis_client:
                data = self.redis_client.get(key)
                if data:
                    cache_data = json.loads(data)
                    return cache_data.get('joke_ids', [])
            else:
                # Check memory cache
                if key in self._memory_cache:
                    expiry = self._cache_expiry.get(key, datetime.min)
                    if datetime.utcnow() < expiry:
                        return self._memory_cache[key].get('joke_ids', [])
                    else:
                        # Cleanup expired
                        del self._memory_cache[key]
                        if key in self._cache_expiry:
                            del self._cache_expiry[key]
            
            return None

        except Exception as e:
            logger.error(f"Error getting cached hot jokes: {str(e)}")
            return None

    # Tag Data Caching

    async def cache_tags(
        self,
        tags: List[Tag],
        category: Optional[str] = None,
        ttl: int = 7200  # 2 hours
    ) -> bool:
        """
        Cache tag data.
        
        Args:
            tags: List of Tag objects
            category: Optional category filter
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully
        """
        try:
            key = self._get_key(f"tags:{category or 'all'}")
            
            tags_data = []
            for tag in tags:
                tags_data.append({
                    'id': tag.id,
                    'name': tag.name,
                    'category': tag.category,
                    'value': tag.value,
                    'description': tag.description
                })
            
            cache_data = {
                'tags': tags_data,
                'cached_at': datetime.utcnow().isoformat(),
                'category': category
            }
            
            if self.redis_client:
                data = json.dumps(cache_data)
                self.redis_client.setex(key, ttl, data)
            else:
                # Fallback to memory cache
                self._memory_cache[key] = cache_data
                self._cache_expiry[key] = datetime.utcnow() + timedelta(seconds=ttl)
            
            logger.debug(f"Cached {len(tags)} tags for category {category or 'all'}")
            return True

        except Exception as e:
            logger.error(f"Error caching tags: {str(e)}")
            return False

    async def get_cached_tags(self, category: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached tags.
        
        Args:
            category: Optional category filter
            
        Returns:
            List of tag dictionaries or None if not cached
        """
        try:
            key = self._get_key(f"tags:{category or 'all'}")
            
            if self.redis_client:
                data = self.redis_client.get(key)
                if data:
                    cache_data = json.loads(data)
                    return cache_data.get('tags', [])
            else:
                # Check memory cache
                if key in self._memory_cache:
                    expiry = self._cache_expiry.get(key, datetime.min)
                    if datetime.utcnow() < expiry:
                        return self._memory_cache[key].get('tags', [])
                    else:
                        # Cleanup expired
                        del self._memory_cache[key]
                        if key in self._cache_expiry:
                            del self._cache_expiry[key]
            
            return None

        except Exception as e:
            logger.error(f"Error getting cached tags: {str(e)}")
            return None

    # User Session Caching

    async def cache_user_session(
        self,
        user_id: str,
        session_data: Dict[str, Any],
        ttl: int = 3600  # 1 hour
    ) -> bool:
        """
        Cache user session data for personalization.
        
        Args:
            user_id: User ID
            session_data: Session data to cache
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully
        """
        try:
            key = self._get_key(f"session:{user_id}")
            
            if self.redis_client:
                data = json.dumps(session_data)
                self.redis_client.setex(key, ttl, data)
            else:
                # Fallback to memory cache
                self._memory_cache[key] = session_data
                self._cache_expiry[key] = datetime.utcnow() + timedelta(seconds=ttl)
            
            logger.debug(f"Cached session data for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error caching user session: {str(e)}")
            return False

    async def get_user_session(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached user session data.
        
        Args:
            user_id: User ID
            
        Returns:
            Session data or None if not cached
        """
        try:
            key = self._get_key(f"session:{user_id}")
            
            if self.redis_client:
                data = self.redis_client.get(key)
                if data:
                    return json.loads(data)
            else:
                # Check memory cache
                if key in self._memory_cache:
                    expiry = self._cache_expiry.get(key, datetime.min)
                    if datetime.utcnow() < expiry:
                        return self._memory_cache[key]
                    else:
                        # Cleanup expired
                        del self._memory_cache[key]
                        if key in self._cache_expiry:
                            del self._cache_expiry[key]
            
            return None

        except Exception as e:
            logger.error(f"Error getting cached user session: {str(e)}")
            return None

    # Cache Management

    async def invalidate_user_cache(self, user_id: str) -> bool:
        """
        Invalidate all cached data for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            True if invalidated successfully
        """
        try:
            patterns = [
                f"user_prefs:{user_id}",
                f"recommendations:{user_id}:*",
                f"session:{user_id}"
            ]
            
            deleted_count = 0
            
            if self.redis_client:
                for pattern in patterns:
                    key_pattern = self._get_key(pattern)
                    if '*' in pattern:
                        # Use scan for pattern matching
                        keys = self.redis_client.keys(key_pattern)
                        if keys:
                            deleted_count += self.redis_client.delete(*keys)
                    else:
                        deleted_count += self.redis_client.delete(key_pattern)
            else:
                # Clean memory cache
                keys_to_remove = []
                for key in self._memory_cache.keys():
                    if any(pattern.replace('*', '') in key for pattern in patterns):
                        keys_to_remove.append(key)
                
                for key in keys_to_remove:
                    del self._memory_cache[key]
                    if key in self._cache_expiry:
                        del self._cache_expiry[key]
                    deleted_count += 1
            
            logger.debug(f"Invalidated {deleted_count} cache entries for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error invalidating user cache: {str(e)}")
            return False

    async def clear_expired_cache(self) -> int:
        """
        Clear expired cache entries (for memory cache fallback).
        
        Returns:
            Number of entries cleared
        """
        if self.redis_client:
            return 0  # Redis handles expiration automatically
        
        try:
            now = datetime.utcnow()
            expired_keys = [
                key for key, expiry in self._cache_expiry.items()
                if expiry <= now
            ]
            
            for key in expired_keys:
                if key in self._memory_cache:
                    del self._memory_cache[key]
                del self._cache_expiry[key]
            
            logger.debug(f"Cleared {len(expired_keys)} expired cache entries")
            return len(expired_keys)

        except Exception as e:
            logger.error(f"Error clearing expired cache: {str(e)}")
            return 0

    async def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with cache statistics
        """
        try:
            if self.redis_client:
                info = self.redis_client.info()
                return {
                    'backend': 'redis',
                    'connected': True,
                    'used_memory': info.get('used_memory_human', 'unknown'),
                    'total_keys': info.get('db0', {}).get('keys', 0),
                    'expired_keys': info.get('expired_keys', 0)
                }
            else:
                return {
                    'backend': 'memory',
                    'connected': True,
                    'total_keys': len(self._memory_cache),
                    'entries_with_expiry': len(self._cache_expiry)
                }

        except Exception as e:
            logger.error(f"Error getting cache stats: {str(e)}")
            return {
                'backend': 'unknown',
                'connected': False,
                'error': str(e)
            }

    def close(self):
        """Close Redis connection."""
        if self.redis_client:
            try:
                self.redis_client.close()
                logger.info("Closed Redis connection")
            except Exception as e:
                logger.error(f"Error closing Redis connection: {str(e)}")


# Global cache instance
cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get the global cache service instance."""
    global cache_service
    if cache_service is None:
        cache_service = CacheService()
    return cache_service


def initialize_cache(redis_url: str = "redis://localhost:6379", key_prefix: str = "giggleslide:"):
    """Initialize the global cache service."""
    global cache_service
    cache_service = CacheService(redis_url=redis_url, key_prefix=key_prefix)