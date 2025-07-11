"""Personalization service for managing joke recommendations and user preference learning."""

from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import asyncio
import logging
import random
from dataclasses import dataclass

from ..database.repositories.personalization_repository import PersonalizationRepository
from ..database.repositories.tag_repository import TagRepository
from ..database.repositories.joke_repository import JokeRepository
from ..database.models import Joke, User
from .ai_joke_service import AIJokeService, JokeGenerationRequest

logger = logging.getLogger(__name__)


@dataclass
class RecommendationConfig:
    """Configuration for recommendation algorithm."""
    exploration_rate: float = 0.1  # 10% exploration, 90% exploitation
    min_tag_confidence: float = 0.5
    diversity_weight: float = 0.2
    recency_weight: float = 0.1
    max_recommendations: int = 50
    similarity_threshold: float = 0.3


@dataclass
class RecommendationResult:
    """Result of recommendation algorithm."""
    jokes: List[Tuple[Joke, float, str]]  # (joke, score, strategy)
    strategy_breakdown: Dict[str, int]
    performance_metrics: Dict[str, float]
    cache_hit: bool = False


class PersonalizationService:
    """Service for personalized joke recommendations and learning."""

    def __init__(
        self,
        personalization_repo: PersonalizationRepository,
        tag_repo: TagRepository,
        joke_repo: JokeRepository,
        ai_joke_service: Optional[AIJokeService] = None,
        config: Optional[RecommendationConfig] = None
    ):
        self.personalization_repo = personalization_repo
        self.tag_repo = tag_repo
        self.joke_repo = joke_repo
        self.ai_joke_service = ai_joke_service
        self.config = config or RecommendationConfig()
        
        # In-memory cache for user preferences (would be Redis in production)
        self._preference_cache = {}
        self._cache_expiry = {}
        
        # AI generation tracking
        self._last_ai_generation = {}
        self._ai_generation_cooldown = timedelta(minutes=5)

    async def get_personalized_recommendations(
        self,
        user_id: str,
        limit: int = 10,
        language: str = 'en',
        exclude_seen: bool = True,
        use_collaborative: bool = True
    ) -> RecommendationResult:
        """
        Get personalized joke recommendations using ε-greedy algorithm.
        
        Args:
            user_id: User ID
            limit: Number of recommendations to return
            language: Language preference
            exclude_seen: Whether to exclude seen jokes
            use_collaborative: Whether to include collaborative filtering
            
        Returns:
            RecommendationResult with jokes and metadata
        """
        try:
            start_time = datetime.utcnow()
            
            # Check cache first
            cache_key = f"{user_id}_{limit}_{language}_{exclude_seen}"
            cached_result = self._get_cached_recommendations(cache_key)
            if cached_result:
                logger.info(f"Returned cached recommendations for user {user_id}")
                return cached_result

            # Get content-based recommendations
            content_recommendations = await self.personalization_repo.get_personalized_recommendations(
                user_id=user_id,
                limit=min(limit * 2, self.config.max_recommendations),
                exploration_rate=self.config.exploration_rate,
                min_confidence=self.config.min_tag_confidence,
                language=language
            )

            # Get collaborative filtering recommendations if enabled
            collaborative_recommendations = []
            if use_collaborative:
                collaborative_recommendations = await self.personalization_repo.get_similar_users_recommendations(
                    user_id=user_id,
                    limit=min(limit, 20),
                    similarity_threshold=self.config.similarity_threshold,
                    language=language
                )

            # Combine and re-rank recommendations
            final_recommendations = await self._combine_recommendations(
                content_recommendations,
                collaborative_recommendations,
                user_id,
                limit
            )

            # Calculate strategy breakdown
            strategy_breakdown = self._calculate_strategy_breakdown(final_recommendations)

            # Calculate performance metrics
            performance_metrics = await self._calculate_performance_metrics(
                user_id, start_time
            )

            result = RecommendationResult(
                jokes=final_recommendations,
                strategy_breakdown=strategy_breakdown,
                performance_metrics=performance_metrics,
                cache_hit=False
            )

            # Cache the result
            self._cache_recommendations(cache_key, result)

            logger.info(f"Generated {len(final_recommendations)} personalized recommendations "
                       f"for user {user_id} in {(datetime.utcnow() - start_time).total_seconds():.3f}s")

            return result

        except Exception as e:
            logger.error(f"Error getting personalized recommendations for user {user_id}: {str(e)}")
            # Fallback to random recommendations
            return await self._get_fallback_recommendations(user_id, limit, language)

    async def update_user_preferences(
        self,
        user_id: str,
        joke_id: str,
        interaction_type: str,
        feedback_strength: float = 1.0
    ) -> Dict[str, Any]:
        """
        Update user preferences based on interaction feedback.
        
        Args:
            user_id: User ID
            joke_id: Joke ID
            interaction_type: Type of interaction ('like', 'skip', 'view')
            feedback_strength: Strength of the feedback signal (0-1)
            
        Returns:
            Dictionary with update results
        """
        try:
            # Update tag scores based on interaction
            updated_count = await self.personalization_repo.update_preferences_from_interaction(
                user_id=user_id,
                joke_id=joke_id,
                interaction_type=interaction_type,
                tag_repository=self.tag_repo
            )

            # Invalidate cache for this user
            self._invalidate_user_cache(user_id)

            # Record interaction for analytics
            await self.joke_repo.mark_as_seen(
                user_id=user_id,
                joke_id=joke_id,
                interaction_type=interaction_type
            )

            result = {
                'user_id': user_id,
                'joke_id': joke_id,
                'interaction_type': interaction_type,
                'tags_updated': updated_count,
                'feedback_strength': feedback_strength,
                'updated_at': datetime.utcnow().isoformat()
            }

            logger.debug(f"Updated preferences for user {user_id}: {updated_count} tags affected")
            return result

        except Exception as e:
            logger.error(f"Error updating user preferences: {str(e)}")
            raise

    async def analyze_user_preferences(
        self,
        user_id: str,
        include_trends: bool = True
    ) -> Dict[str, Any]:
        """
        Analyze user's preferences and behavior patterns.
        
        Args:
            user_id: User ID
            include_trends: Whether to include trend analysis
            
        Returns:
            Dictionary with preference analysis
        """
        try:
            # Get user's tag scores
            tag_scores = await self.tag_repo.get_user_tag_scores(user_id)
            
            # Group by category
            preferences_by_category = {
                'style': [],
                'format': [],
                'topic': [],
                'tone': []
            }

            for score in tag_scores:
                if score.score > 0:  # Only positive preferences
                    category = score.tag.category
                    preferences_by_category[category].append({
                        'tag': score.tag.name,
                        'score': score.score,
                        'interactions': score.interaction_count
                    })

            # Sort by score within each category
            for category in preferences_by_category:
                preferences_by_category[category].sort(
                    key=lambda x: x['score'], reverse=True
                )

            # Get top preferences overall
            top_preferences = await self.tag_repo.get_user_top_tags(user_id, limit=10)

            # Calculate diversity and performance metrics
            diversity_score = await self.personalization_repo.calculate_user_diversity_score(user_id)
            performance_metrics = await self.personalization_repo.get_recommendation_performance(user_id)

            analysis = {
                'user_id': user_id,
                'preferences_by_category': preferences_by_category,
                'top_preferences': [
                    {'tag': tag.name, 'category': tag.category, 'score': score}
                    for tag, score in top_preferences
                ],
                'diversity_score': diversity_score,
                'performance_metrics': performance_metrics,
                'total_tag_scores': len(tag_scores),
                'positive_preferences': len([s for s in tag_scores if s.score > 0]),
                'analyzed_at': datetime.utcnow().isoformat()
            }

            if include_trends:
                # Add trend analysis (simplified for now)
                trends = await self._analyze_preference_trends(user_id)
                analysis['trends'] = trends

            return analysis

        except Exception as e:
            logger.error(f"Error analyzing user preferences for {user_id}: {str(e)}")
            raise

    async def get_recommendation_explanation(
        self,
        user_id: str,
        joke_id: str
    ) -> Dict[str, Any]:
        """
        Get explanation for why a joke was recommended.
        
        Args:
            user_id: User ID
            joke_id: Joke ID
            
        Returns:
            Dictionary with recommendation explanation
        """
        try:
            # Get joke tags
            joke_tags = await self.tag_repo.get_joke_tags(joke_id)
            
            # Get user preferences for those tags
            user_preferences = await self.tag_repo.get_user_tag_scores(user_id)
            user_pref_map = {score.tag_id: score.score for score in user_preferences}

            # Calculate match reasons
            matches = []
            total_match_score = 0.0

            for tag, confidence in joke_tags:
                user_score = user_pref_map.get(tag.id, 0.0)
                if user_score > 0:
                    match_strength = user_score * confidence
                    total_match_score += match_strength
                    
                    matches.append({
                        'tag': tag.name,
                        'category': tag.category,
                        'user_preference': user_score,
                        'tag_confidence': confidence,
                        'match_strength': match_strength
                    })

            # Sort matches by strength
            matches.sort(key=lambda x: x['match_strength'], reverse=True)

            explanation = {
                'user_id': user_id,
                'joke_id': joke_id,
                'total_match_score': total_match_score,
                'top_matches': matches[:5],  # Top 5 matching reasons
                'recommendation_strength': min(1.0, total_match_score),
                'explanation_generated_at': datetime.utcnow().isoformat()
            }

            return explanation

        except Exception as e:
            logger.error(f"Error generating recommendation explanation: {str(e)}")
            return {}

    # Cold Start Handling

    async def handle_cold_start_user(
        self,
        user_id: str,
        initial_preferences: Optional[Dict[str, List[str]]] = None,
        language: str = 'en'
    ) -> RecommendationResult:
        """
        Handle recommendations for new users (cold start problem).
        
        Args:
            user_id: New user ID
            initial_preferences: Optional initial preferences by category
            language: Language preference
            
        Returns:
            RecommendationResult with diverse, popular jokes
        """
        try:
            # If initial preferences provided, initialize tag scores
            if initial_preferences:
                await self._initialize_user_preferences(user_id, initial_preferences)

            # Get popular, diverse jokes for cold start
            trending_jokes = await self.joke_repo.get_trending_jokes(
                language=language,
                time_window_hours=168,  # 1 week
                limit=20
            )

            # Convert to recommendation format with exploration strategy
            recommendations = [
                (joke, 0.5 + random.uniform(-0.1, 0.1), 'explore')
                for joke in trending_jokes
            ]

            # Ensure diversity across categories
            diverse_recommendations = await self._ensure_diversity(recommendations, limit=10)

            result = RecommendationResult(
                jokes=diverse_recommendations,
                strategy_breakdown={'explore': len(diverse_recommendations)},
                performance_metrics={'cold_start': True},
                cache_hit=False
            )

            logger.info(f"Generated cold start recommendations for new user {user_id}")
            return result

        except Exception as e:
            logger.error(f"Error handling cold start for user {user_id}: {str(e)}")
            return await self._get_fallback_recommendations(user_id, 10, language)

    # Helper Methods

    async def _combine_recommendations(
        self,
        content_recs: List[Tuple[Joke, float, str]],
        collaborative_recs: List[Tuple[Joke, float]],
        user_id: str,
        limit: int
    ) -> List[Tuple[Joke, float, str]]:
        """Combine content-based and collaborative recommendations."""
        # Convert collaborative recs to same format
        collaborative_formatted = [
            (joke, score, 'collaborative') 
            for joke, score in collaborative_recs
        ]

        # Combine and deduplicate
        all_recs = content_recs + collaborative_formatted
        seen_joke_ids = set()
        unique_recs = []

        for joke, score, strategy in all_recs:
            if joke.id not in seen_joke_ids:
                seen_joke_ids.add(joke.id)
                unique_recs.append((joke, score, strategy))

        # Re-rank with diversity consideration
        diverse_recs = await self._ensure_diversity(unique_recs, limit)
        
        return diverse_recs

    async def _ensure_diversity(
        self,
        recommendations: List[Tuple[Joke, float, str]],
        limit: int
    ) -> List[Tuple[Joke, float, str]]:
        """Ensure diversity in recommendations across different tag categories."""
        if len(recommendations) <= limit:
            return recommendations

        # Group by primary tag categories
        category_groups = {}
        for joke, score, strategy in recommendations:
            # Get joke's primary category (simplified)
            joke_tags = await self.tag_repo.get_joke_tags(joke.id)
            if joke_tags:
                primary_category = joke_tags[0][0].category
                if primary_category not in category_groups:
                    category_groups[primary_category] = []
                category_groups[primary_category].append((joke, score, strategy))

        # Select diverse recommendations
        diverse_recs = []
        category_keys = list(category_groups.keys())
        
        while len(diverse_recs) < limit and category_groups:
            for category in category_keys[:]:
                if category in category_groups and category_groups[category]:
                    # Take best from this category
                    best = category_groups[category].pop(0)
                    diverse_recs.append(best)
                    
                    if len(diverse_recs) >= limit:
                        break
                
                # Remove empty categories
                if category in category_groups and not category_groups[category]:
                    del category_groups[category]
                    category_keys.remove(category)

        return diverse_recs

    def _calculate_strategy_breakdown(
        self,
        recommendations: List[Tuple[Joke, float, str]]
    ) -> Dict[str, int]:
        """Calculate breakdown of recommendation strategies."""
        breakdown = {}
        for _, _, strategy in recommendations:
            breakdown[strategy] = breakdown.get(strategy, 0) + 1
        return breakdown

    async def _calculate_performance_metrics(
        self,
        user_id: str,
        start_time: datetime
    ) -> Dict[str, float]:
        """Calculate performance metrics for the recommendation session."""
        try:
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Get recent performance metrics
            recent_metrics = await self.personalization_repo.get_recommendation_performance(
                user_id, days=7
            )

            return {
                'processing_time_seconds': processing_time,
                'recent_ctr': recent_metrics.get('click_through_rate', 0.0),
                'recent_diversity': recent_metrics.get('diversity_score', 0.0),
                'generated_at': datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Error calculating performance metrics: {str(e)}")
            return {'processing_time_seconds': 0.0}

    async def _get_fallback_recommendations(
        self,
        user_id: str,
        limit: int,
        language: str
    ) -> RecommendationResult:
        """Get fallback recommendations when personalization fails."""
        try:
            # First try to get trending jokes
            trending_jokes = await self.joke_repo.get_trending_jokes(
                language=language,
                limit=limit
            )

            # If we have enough trending jokes, use them
            if len(trending_jokes) >= limit:
                recommendations = [
                    (joke, 0.5, 'fallback') for joke in trending_jokes
                ]
                
                return RecommendationResult(
                    jokes=recommendations,
                    strategy_breakdown={'fallback': len(recommendations)},
                    performance_metrics={'fallback': True},
                    cache_hit=False
                )

            # If not enough jokes and AI service is available, generate new ones
            if self.ai_joke_service and await self._can_generate_ai_jokes(user_id):
                try:
                    logger.info(f"Generating AI jokes for user {user_id} as fallback")
                    
                    # Get user preferences if available
                    user_tags = {}
                    try:
                        tag_scores = await self.tag_repo.get_user_tag_scores(user_id)
                        
                        # Group by category
                        for score in tag_scores:
                            if score.score > 0:
                                category = score.tag.category
                                if category not in user_tags:
                                    user_tags[category] = []
                                user_tags[category].append((score.tag.value, score.score))
                    except:
                        # If can't get user preferences, use defaults
                        pass
                    
                    # Generate personalized jokes if we have preferences, otherwise generic
                    if user_tags:
                        generated_jokes = await self.ai_joke_service.generate_personalized_jokes(
                            user_id=user_id,
                            user_tags=user_tags,
                            language=language,
                            count=limit - len(trending_jokes)
                        )
                    else:
                        generated_jokes = await self.ai_joke_service.generate_fallback_jokes(
                            language=language,
                            count=limit - len(trending_jokes)
                        )
                    
                    # Store generated jokes
                    ai_recommendations = []
                    for gen_joke in generated_jokes:
                        # Store in database
                        joke_data = {
                            "text": gen_joke.text,
                            "language": gen_joke.language,
                            "source": "ai_generated"
                        }
                        stored_joke = await self.joke_repo.create(**joke_data)
                        
                        # Add tags
                        for category, tag_names in gen_joke.tags.items():
                            for tag_name in tag_names:
                                tags = await self.tag_repo.get_tags_by_category(category)
                                tag = next((t for t in tags if t.value == tag_name), None)
                                if tag:
                                    await self.tag_repo.add_joke_tag(
                                        joke_id=stored_joke.id,
                                        tag_id=tag.id,
                                        confidence=gen_joke.confidence
                                    )
                        
                        ai_recommendations.append((stored_joke, 0.7, 'ai_generated'))
                    
                    # Update generation tracking
                    self._last_ai_generation[user_id] = datetime.utcnow()
                    
                    # Combine trending and AI-generated jokes
                    all_recommendations = [
                        (joke, 0.5, 'fallback') for joke in trending_jokes
                    ] + ai_recommendations
                    
                    return RecommendationResult(
                        jokes=all_recommendations[:limit],
                        strategy_breakdown={
                            'fallback': len(trending_jokes),
                            'ai_generated': len(ai_recommendations)
                        },
                        performance_metrics={'ai_fallback': True},
                        cache_hit=False
                    )
                    
                except Exception as e:
                    logger.error(f"AI generation failed: {str(e)}")
                    # Continue with trending jokes only
            
            # Return whatever trending jokes we have
            recommendations = [
                (joke, 0.5, 'fallback') for joke in trending_jokes
            ]

            return RecommendationResult(
                jokes=recommendations,
                strategy_breakdown={'fallback': len(recommendations)},
                performance_metrics={'fallback': True},
                cache_hit=False
            )

        except Exception as e:
            logger.error(f"Error getting fallback recommendations: {str(e)}")
            return RecommendationResult(
                jokes=[],
                strategy_breakdown={},
                performance_metrics={'error': True},
                cache_hit=False
            )

    async def _analyze_preference_trends(self, user_id: str) -> Dict[str, Any]:
        """Analyze trends in user preferences over time."""
        # Simplified trend analysis
        return {
            'trending_up': [],
            'trending_down': [],
            'stable': [],
            'analysis_period_days': 30
        }

    async def _initialize_user_preferences(
        self,
        user_id: str,
        preferences: Dict[str, List[str]]
    ):
        """Initialize preferences for a new user."""
        for category, tag_names in preferences.items():
            tags = await self.tag_repo.get_tags_by_category(category)
            tag_map = {tag.name.lower(): tag for tag in tags}
            
            for tag_name in tag_names:
                tag = tag_map.get(tag_name.lower())
                if tag:
                    await self.tag_repo.update_user_tag_score(
                        user_id=user_id,
                        tag_id=tag.id,
                        score_delta=0.5,  # Initial positive preference
                        interaction_weight=1.0
                    )

    # Cache Management

    def _get_cached_recommendations(self, cache_key: str) -> Optional[RecommendationResult]:
        """Get cached recommendations if available and not expired."""
        if cache_key in self._preference_cache:
            expiry = self._cache_expiry.get(cache_key, datetime.min)
            if datetime.utcnow() < expiry:
                result = self._preference_cache[cache_key]
                result.cache_hit = True
                return result
            else:
                # Cleanup expired cache
                del self._preference_cache[cache_key]
                del self._cache_expiry[cache_key]
        return None

    def _cache_recommendations(self, cache_key: str, result: RecommendationResult):
        """Cache recommendations with expiry."""
        # Cache for 5 minutes
        self._preference_cache[cache_key] = result
        self._cache_expiry[cache_key] = datetime.utcnow() + timedelta(minutes=5)

    def _invalidate_user_cache(self, user_id: str):
        """Invalidate all cached recommendations for a user."""
        keys_to_remove = [
            key for key in self._preference_cache.keys() 
            if key.startswith(f"{user_id}_")
        ]
        for key in keys_to_remove:
            if key in self._preference_cache:
                del self._preference_cache[key]
            if key in self._cache_expiry:
                del self._cache_expiry[key]

    async def _can_generate_ai_jokes(self, user_id: str) -> bool:
        """Check if AI joke generation is allowed for this user."""
        # Check if user is in cooldown
        last_generation = self._last_ai_generation.get(user_id)
        if last_generation:
            time_since_last = datetime.utcnow() - last_generation
            if time_since_last < self._ai_generation_cooldown:
                logger.debug(f"User {user_id} in AI generation cooldown")
                return False
        
        return True