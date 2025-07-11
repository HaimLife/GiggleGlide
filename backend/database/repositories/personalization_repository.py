"""Personalization repository for recommendation algorithms and user preference learning."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, text, desc, asc, update
from sqlalchemy.orm import selectinload, joinedload
from datetime import datetime, timedelta
import random
import logging
import math
from collections import defaultdict

from .base import BaseRepository, RepositoryError, NotFoundError
from ..models import (
    Joke, User, JokeInteraction, UserTagScore, Tag, JokeTag, 
    PersonalizationMetric, Favorite
)

logger = logging.getLogger(__name__)


class PersonalizationRepository(BaseRepository[Joke, Dict[str, Any], Dict[str, Any]]):
    """Repository for personalized joke recommendations."""

    def __init__(self, session):
        super().__init__(Joke, session)
        self._default_relationships = ['joke_tags', 'interactions']

    async def get_specialized_query(self, **kwargs):
        """Base implementation for abstract method."""
        return select(self.model)

    # Personalized Recommendation Methods

    async def get_personalized_recommendations(
        self,
        user_id: str,
        limit: int = 10,
        exploration_rate: float = 0.1,
        min_confidence: float = 0.5,
        language: str = 'en'
    ) -> List[Tuple[Joke, float, str]]:
        """
        Get personalized joke recommendations using ε-greedy algorithm.
        
        Args:
            user_id: User ID
            limit: Number of recommendations to return
            exploration_rate: Exploration rate for ε-greedy (0.1 = 10% exploration)
            min_confidence: Minimum confidence for tag assignments
            language: Language preference
            
        Returns:
            List of (joke, score, strategy) tuples where strategy is 'exploit' or 'explore'
        """
        try:
            # Get user's tag preferences
            user_preferences = await self._get_user_preferences(user_id)
            
            # Get unseen jokes with their tags
            unseen_jokes = await self._get_unseen_jokes_with_tags(
                user_id, language, min_confidence
            )
            
            if not unseen_jokes:
                logger.warning(f"No unseen jokes available for user {user_id}")
                return []
            
            # Calculate scores for each joke
            scored_jokes = []
            for joke, tags in unseen_jokes:
                exploit_score = self._calculate_exploitation_score(tags, user_preferences)
                scored_jokes.append((joke, tags, exploit_score))
            
            # Sort by exploitation score
            scored_jokes.sort(key=lambda x: x[2], reverse=True)
            
            # Apply ε-greedy strategy
            recommendations = []
            exploit_count = int(limit * (1 - exploration_rate))
            explore_count = limit - exploit_count
            
            # Exploitation: Select top-scored jokes
            for i in range(min(exploit_count, len(scored_jokes))):
                joke, tags, score = scored_jokes[i]
                recommendations.append((joke, score, 'exploit'))
            
            # Exploration: Random selection from remaining jokes
            if explore_count > 0 and len(scored_jokes) > exploit_count:
                remaining_jokes = scored_jokes[exploit_count:]
                random.shuffle(remaining_jokes)
                
                for i in range(min(explore_count, len(remaining_jokes))):
                    joke, tags, score = remaining_jokes[i]
                    # Add randomness to exploration score
                    explore_score = score + random.uniform(-0.2, 0.2)
                    recommendations.append((joke, explore_score, 'explore'))
            
            # Randomize the final order to mix exploitation and exploration
            random.shuffle(recommendations)
            
            logger.info(f"Generated {len(recommendations)} recommendations for user {user_id} "
                       f"({exploit_count} exploit, {len(recommendations) - exploit_count} explore)")
            
            return recommendations[:limit]

        except Exception as e:
            logger.error(f"Error getting personalized recommendations for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get personalized recommendations: {str(e)}")

    async def get_similar_users_recommendations(
        self,
        user_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.3,
        language: str = 'en'
    ) -> List[Tuple[Joke, float]]:
        """
        Get recommendations based on similar users' preferences.
        
        Args:
            user_id: Target user ID
            limit: Number of recommendations to return
            similarity_threshold: Minimum similarity score for users
            language: Language preference
            
        Returns:
            List of (joke, similarity_score) tuples
        """
        try:
            # Find similar users based on tag preferences
            similar_users = await self._find_similar_users(user_id, similarity_threshold)
            
            if not similar_users:
                logger.info(f"No similar users found for user {user_id}")
                return []
            
            # Get jokes liked by similar users
            similar_user_ids = [user_id for user_id, _ in similar_users]
            
            # Subquery for jokes the target user has already seen
            seen_subquery = (
                select(JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.interaction_type.in_(['view', 'like', 'skip'])
                    )
                )
            )
            
            # Get jokes liked by similar users
            query = (
                select(
                    Joke,
                    func.count(JokeInteraction.id).label('like_count'),
                    func.avg(func.case(
                        [(JokeInteraction.interaction_type == 'like', 1.0)],
                        else_=0.0
                    )).label('avg_rating')
                )
                .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id.in_(similar_user_ids),
                        JokeInteraction.interaction_type == 'like',
                        Joke.language == language,
                        Joke.id.notin_(seen_subquery)
                    )
                )
                .group_by(Joke.id)
                .order_by(desc(text('like_count')), desc(text('avg_rating')))
                .limit(limit)
                .options(selectinload(Joke.joke_tags))
            )
            
            result = await self.session.execute(query)
            recommendations = []
            
            for row in result.fetchall():
                joke = row[0]
                like_count = row[1]
                avg_rating = row[2]
                
                # Calculate similarity score based on similar users who liked this joke
                similarity_score = self._calculate_collaborative_score(
                    joke.id, similar_users, user_id
                )
                
                recommendations.append((joke, similarity_score))
            
            logger.info(f"Generated {len(recommendations)} collaborative filtering recommendations "
                       f"for user {user_id}")
            
            return recommendations

        except Exception as e:
            logger.error(f"Error getting similar users recommendations: {str(e)}")
            raise RepositoryError(f"Failed to get similar users recommendations: {str(e)}")

    # User Preference Learning

    async def update_preferences_from_interaction(
        self,
        user_id: str,
        joke_id: str,
        interaction_type: str,
        tag_repository
    ) -> int:
        """
        Update user preferences based on joke interaction.
        
        Args:
            user_id: User ID
            joke_id: Joke ID
            interaction_type: Type of interaction ('like', 'skip', 'view')
            tag_repository: Tag repository instance
            
        Returns:
            Number of tag scores updated
        """
        try:
            # Get joke tags
            joke_tags = await tag_repository.get_joke_tags(joke_id)
            
            if not joke_tags:
                logger.debug(f"No tags found for joke {joke_id}")
                return 0
            
            # Define score changes based on interaction type
            score_changes = {
                'like': 0.3,      # Positive reinforcement
                'skip': -0.1,     # Negative reinforcement
                'view': 0.05      # Weak positive signal
            }
            
            score_delta = score_changes.get(interaction_type, 0)
            if score_delta == 0:
                return 0
            
            updated_count = 0
            for tag, confidence in joke_tags:
                # Weight the score change by tag confidence
                weighted_delta = score_delta * confidence
                
                await tag_repository.update_user_tag_score(
                    user_id=user_id,
                    tag_id=tag.id,
                    score_delta=weighted_delta,
                    interaction_weight=confidence
                )
                updated_count += 1
            
            logger.debug(f"Updated {updated_count} tag scores for user {user_id} "
                        f"based on {interaction_type} interaction with joke {joke_id}")
            
            return updated_count

        except Exception as e:
            logger.error(f"Error updating preferences from interaction: {str(e)}")
            raise RepositoryError(f"Failed to update preferences: {str(e)}")

    async def calculate_user_diversity_score(
        self,
        user_id: str,
        days: int = 7
    ) -> float:
        """
        Calculate diversity score of jokes viewed by user in recent period.
        
        Args:
            user_id: User ID
            days: Number of days to look back
            
        Returns:
            Diversity score (0-1, higher is more diverse)
        """
        try:
            # Get recent interactions
            time_threshold = datetime.utcnow() - timedelta(days=days)
            
            query = (
                select(func.distinct(Tag.category))
                .join(JokeTag, Tag.id == JokeTag.tag_id)
                .join(JokeInteraction, JokeTag.joke_id == JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.created_at >= time_threshold,
                        JokeInteraction.interaction_type.in_(['view', 'like'])
                    )
                )
            )
            
            result = await self.session.execute(query)
            unique_categories = len(result.fetchall())
            
            # Normalize by total number of categories (4: style, format, topic, tone)
            diversity_score = min(1.0, unique_categories / 4.0)
            
            return diversity_score

        except Exception as e:
            logger.error(f"Error calculating diversity score for user {user_id}: {str(e)}")
            return 0.0

    # Analytics and Metrics

    async def record_personalization_metric(
        self,
        user_id: str,
        metric_type: str,
        value: float,
        period_start: datetime,
        period_end: datetime
    ) -> PersonalizationMetric:
        """
        Record a personalization performance metric.
        
        Args:
            user_id: User ID
            metric_type: Type of metric
            value: Metric value
            period_start: Start of measurement period
            period_end: End of measurement period
            
        Returns:
            Created metric record
        """
        try:
            metric = PersonalizationMetric(
                user_id=user_id,
                metric_type=metric_type,
                value=value,
                period_start=period_start,
                period_end=period_end
            )
            
            self.session.add(metric)
            await self.session.flush()
            await self.session.refresh(metric)
            
            logger.debug(f"Recorded {metric_type} metric for user {user_id}: {value}")
            return metric

        except Exception as e:
            logger.error(f"Error recording personalization metric: {str(e)}")
            raise RepositoryError(f"Failed to record metric: {str(e)}")

    async def get_recommendation_performance(
        self,
        user_id: str,
        days: int = 30
    ) -> Dict[str, float]:
        """
        Get recommendation performance metrics for a user.
        
        Args:
            user_id: User ID
            days: Number of days to analyze
            
        Returns:
            Dictionary of performance metrics
        """
        try:
            time_threshold = datetime.utcnow() - timedelta(days=days)
            
            # Calculate click-through rate (likes / views)
            interactions_query = (
                select(
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('count')
                )
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.created_at >= time_threshold
                    )
                )
                .group_by(JokeInteraction.interaction_type)
            )
            
            result = await self.session.execute(interactions_query)
            interaction_counts = {row[0]: row[1] for row in result.fetchall()}
            
            views = interaction_counts.get('view', 0)
            likes = interaction_counts.get('like', 0)
            skips = interaction_counts.get('skip', 0)
            
            ctr = likes / max(views, 1)
            skip_rate = skips / max(views, 1)
            
            # Calculate diversity score
            diversity_score = await self.calculate_user_diversity_score(user_id, days)
            
            # Calculate exploration rate (approximate)
            exploration_rate = min(0.5, skips / max(views, 1))  # Simplified metric
            
            return {
                'click_through_rate': ctr,
                'skip_rate': skip_rate,
                'diversity_score': diversity_score,
                'exploration_rate': exploration_rate,
                'total_views': views,
                'total_likes': likes,
                'total_skips': skips
            }

        except Exception as e:
            logger.error(f"Error getting recommendation performance: {str(e)}")
            return {}

    # Helper Methods

    async def _get_user_preferences(self, user_id: str) -> Dict[str, float]:
        """Get user's tag preferences as a dictionary."""
        try:
            query = (
                select(Tag.id, UserTagScore.score)
                .join(UserTagScore, Tag.id == UserTagScore.tag_id)
                .where(UserTagScore.user_id == user_id)
            )
            
            result = await self.session.execute(query)
            return {tag_id: score for tag_id, score in result.fetchall()}

        except Exception as e:
            logger.error(f"Error getting user preferences: {str(e)}")
            return {}

    async def _get_unseen_jokes_with_tags(
        self,
        user_id: str,
        language: str,
        min_confidence: float
    ) -> List[Tuple[Joke, List[Tuple[Tag, float]]]]:
        """Get unseen jokes with their tags."""
        try:
            # Subquery for seen jokes
            seen_subquery = (
                select(JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.interaction_type.in_(['view', 'like', 'skip'])
                    )
                )
            )
            
            # Get unseen jokes
            jokes_query = (
                select(Joke)
                .where(
                    and_(
                        Joke.language == language,
                        Joke.id.notin_(seen_subquery),
                        Joke.rating >= 2.0  # Only recommend decent jokes
                    )
                )
                .options(selectinload(Joke.joke_tags))
                .limit(200)  # Limit for performance
            )
            
            result = await self.session.execute(jokes_query)
            jokes = result.scalars().all()
            
            # Get tags for each joke
            jokes_with_tags = []
            for joke in jokes:
                tags_query = (
                    select(Tag, JokeTag.confidence)
                    .join(JokeTag, Tag.id == JokeTag.tag_id)
                    .where(
                        and_(
                            JokeTag.joke_id == joke.id,
                            JokeTag.confidence >= min_confidence
                        )
                    )
                )
                
                tags_result = await self.session.execute(tags_query)
                tags = [(row[0], row[1]) for row in tags_result.fetchall()]
                
                if tags:  # Only include jokes with tags
                    jokes_with_tags.append((joke, tags))
            
            return jokes_with_tags

        except Exception as e:
            logger.error(f"Error getting unseen jokes with tags: {str(e)}")
            return []

    def _calculate_exploitation_score(
        self,
        joke_tags: List[Tuple[Tag, float]],
        user_preferences: Dict[str, float]
    ) -> float:
        """Calculate exploitation score for a joke based on user preferences."""
        if not joke_tags or not user_preferences:
            return 0.0
        
        total_score = 0.0
        total_weight = 0.0
        
        for tag, confidence in joke_tags:
            preference_score = user_preferences.get(tag.id, 0.0)
            weighted_score = preference_score * confidence
            total_score += weighted_score
            total_weight += confidence
        
        # Normalize by total weight
        if total_weight > 0:
            return total_score / total_weight
        
        return 0.0

    async def _find_similar_users(
        self,
        user_id: str,
        similarity_threshold: float
    ) -> List[Tuple[str, float]]:
        """Find users with similar tag preferences."""
        try:
            # Get target user's preferences
            target_preferences = await self._get_user_preferences(user_id)
            
            if not target_preferences:
                return []
            
            # Get all other users' preferences
            query = (
                select(UserTagScore.user_id, UserTagScore.tag_id, UserTagScore.score)
                .where(UserTagScore.user_id != user_id)
            )
            
            result = await self.session.execute(query)
            
            # Group by user
            user_preferences = defaultdict(dict)
            for user_id_other, tag_id, score in result.fetchall():
                user_preferences[user_id_other][tag_id] = score
            
            # Calculate similarities
            similar_users = []
            for other_user_id, other_preferences in user_preferences.items():
                similarity = self._calculate_cosine_similarity(
                    target_preferences, other_preferences
                )
                
                if similarity >= similarity_threshold:
                    similar_users.append((other_user_id, similarity))
            
            # Sort by similarity
            similar_users.sort(key=lambda x: x[1], reverse=True)
            return similar_users[:10]  # Top 10 similar users

        except Exception as e:
            logger.error(f"Error finding similar users: {str(e)}")
            return []

    def _calculate_cosine_similarity(
        self,
        prefs1: Dict[str, float],
        prefs2: Dict[str, float]
    ) -> float:
        """Calculate cosine similarity between two preference vectors."""
        # Get common tags
        common_tags = set(prefs1.keys()) & set(prefs2.keys())
        
        if not common_tags:
            return 0.0
        
        # Calculate dot product and magnitudes
        dot_product = sum(prefs1[tag] * prefs2[tag] for tag in common_tags)
        
        magnitude1 = math.sqrt(sum(prefs1[tag] ** 2 for tag in common_tags))
        magnitude2 = math.sqrt(sum(prefs2[tag] ** 2 for tag in common_tags))
        
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0
        
        return dot_product / (magnitude1 * magnitude2)

    async def _calculate_collaborative_score(
        self,
        joke_id: str,
        similar_users: List[Tuple[str, float]],
        target_user_id: str
    ) -> float:
        """Calculate collaborative filtering score for a joke."""
        if not similar_users:
            return 0.0
        
        # Get interactions from similar users for this joke
        similar_user_ids = [user_id for user_id, _ in similar_users]
        
        query = (
            select(JokeInteraction.user_id, JokeInteraction.interaction_type)
            .where(
                and_(
                    JokeInteraction.joke_id == joke_id,
                    JokeInteraction.user_id.in_(similar_user_ids)
                )
            )
        )
        
        result = await self.session.execute(query)
        
        # Calculate weighted score based on similar users' interactions
        total_score = 0.0
        total_weight = 0.0
        
        user_similarity_map = dict(similar_users)
        
        for user_id, interaction_type in result.fetchall():
            similarity = user_similarity_map[user_id]
            
            interaction_score = {
                'like': 1.0,
                'view': 0.3,
                'skip': -0.5
            }.get(interaction_type, 0.0)
            
            total_score += interaction_score * similarity
            total_weight += similarity
        
        if total_weight > 0:
            return total_score / total_weight
        
        return 0.0