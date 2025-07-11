"""Interaction repository for user feedback and sentiment tracking."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, desc, asc, text, case
from sqlalchemy.orm import selectinload, joinedload
from datetime import datetime, timedelta
import logging
from enum import Enum

from .base import BaseRepository, RepositoryError, NotFoundError, ValidationError
from ..models import JokeInteraction, Favorite, User, Joke, UserStats

logger = logging.getLogger(__name__)


class SentimentType(Enum):
    """Sentiment categories for user feedback."""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class InteractionRepository(BaseRepository[JokeInteraction, Dict[str, Any], Dict[str, Any]]):
    """Repository for interaction and feedback operations."""

    def __init__(self, session):
        super().__init__(JokeInteraction, session)
        self._default_relationships = ['user', 'joke']

    async def get_specialized_query(self, **kwargs):
        """Base implementation for abstract method."""
        return select(self.model)

    # Core Feedback Recording

    async def record_feedback(
        self,
        user_id: str,
        joke_id: str,
        interaction_type: str,
        feedback_data: Optional[Dict[str, Any]] = None
    ) -> JokeInteraction:
        """
        Record user feedback/interaction with a joke.
        
        Args:
            user_id: User ID
            joke_id: Joke ID
            interaction_type: Type of interaction ('view', 'like', 'skip', 'share', 'report')
            feedback_data: Optional additional feedback data
            
        Returns:
            Created interaction record
        """
        try:
            # Validate interaction type
            valid_types = ['view', 'like', 'skip', 'share', 'report']
            if interaction_type not in valid_types:
                raise ValidationError(f"Invalid interaction type: {interaction_type}")

            # Check for existing interaction of same type
            existing_query = (
                select(JokeInteraction)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.joke_id == joke_id,
                        JokeInteraction.interaction_type == interaction_type
                    )
                )
            )
            result = await self.session.execute(existing_query)
            existing = result.scalar_one_or_none()

            if existing:
                logger.debug(f"Interaction already exists: {user_id}, {joke_id}, {interaction_type}")
                return existing

            # Create interaction record
            interaction_data = {
                'user_id': user_id,
                'joke_id': joke_id,
                'interaction_type': interaction_type
            }

            interaction = await self.create(interaction_data, commit=False)

            # Update related statistics
            await self._update_interaction_stats(user_id, joke_id, interaction_type)

            await self.session.commit()
            await self.session.refresh(interaction)

            logger.info(f"Recorded {interaction_type} interaction: user {user_id}, joke {joke_id}")
            return interaction

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error recording feedback: {str(e)}")
            raise RepositoryError(f"Failed to record feedback: {str(e)}")

    async def get_user_sentiment_stats(
        self,
        user_id: str,
        time_window_days: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get user sentiment statistics based on interactions.
        
        Args:
            user_id: User ID
            time_window_days: Optional time window for analysis
            
        Returns:
            Dictionary with sentiment statistics
        """
        try:
            # Build base query
            query = (
                select(
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('count')
                )
                .where(JokeInteraction.user_id == user_id)
                .group_by(JokeInteraction.interaction_type)
            )

            # Add time filter if specified
            if time_window_days:
                time_threshold = datetime.utcnow() - timedelta(days=time_window_days)
                query = query.where(JokeInteraction.created_at >= time_threshold)

            result = await self.session.execute(query)
            interaction_counts = {row[0]: row[1] for row in result.fetchall()}

            # Calculate sentiment metrics
            total_interactions = sum(interaction_counts.values())
            
            if total_interactions == 0:
                return {
                    'sentiment': SentimentType.NEUTRAL.value,
                    'confidence': 0.0,
                    'total_interactions': 0,
                    'interaction_breakdown': {},
                    'sentiment_score': 0.0,
                    'engagement_level': 'none'
                }

            # Define sentiment weights
            sentiment_weights = {
                'like': 2,
                'share': 2,
                'view': 0,
                'skip': -1,
                'report': -3
            }

            # Calculate weighted sentiment score
            weighted_score = sum(
                interaction_counts.get(interaction, 0) * weight
                for interaction, weight in sentiment_weights.items()
            )

            sentiment_score = weighted_score / total_interactions

            # Determine sentiment category and confidence
            if sentiment_score > 0.5:
                sentiment = SentimentType.POSITIVE.value
                confidence = min(sentiment_score / 2.0, 1.0)
            elif sentiment_score < -0.5:
                sentiment = SentimentType.NEGATIVE.value
                confidence = min(abs(sentiment_score) / 2.0, 1.0)
            else:
                sentiment = SentimentType.NEUTRAL.value
                confidence = 1.0 - abs(sentiment_score)

            # Determine engagement level
            if total_interactions < 10:
                engagement_level = 'low'
            elif total_interactions < 50:
                engagement_level = 'medium'
            else:
                engagement_level = 'high'

            return {
                'sentiment': sentiment,
                'confidence': round(confidence, 3),
                'total_interactions': total_interactions,
                'interaction_breakdown': interaction_counts,
                'sentiment_score': round(sentiment_score, 3),
                'engagement_level': engagement_level,
                'time_window_days': time_window_days
            }

        except Exception as e:
            logger.error(f"Error getting user sentiment stats for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get user sentiment stats: {str(e)}")

    # Advanced Analytics

    async def get_interaction_patterns(
        self,
        user_id: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Analyze user interaction patterns over time.
        
        Args:
            user_id: User ID
            days: Number of days to analyze
            
        Returns:
            Dictionary with interaction patterns
        """
        try:
            date_threshold = datetime.utcnow() - timedelta(days=days)

            # Get daily interaction patterns
            daily_query = (
                select(
                    func.date(JokeInteraction.created_at).label('date'),
                    func.extract('hour', JokeInteraction.created_at).label('hour'),
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('count')
                )
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.created_at >= date_threshold
                    )
                )
                .group_by(
                    func.date(JokeInteraction.created_at),
                    func.extract('hour', JokeInteraction.created_at),
                    JokeInteraction.interaction_type
                )
                .order_by(
                    func.date(JokeInteraction.created_at),
                    func.extract('hour', JokeInteraction.created_at)
                )
            )

            result = await self.session.execute(daily_query)
            daily_data = result.fetchall()

            # Process patterns
            hourly_patterns = {}
            daily_totals = {}
            interaction_trends = {}

            for date, hour, interaction_type, count in daily_data:
                date_str = date.strftime('%Y-%m-%d')
                
                # Hourly patterns
                if hour not in hourly_patterns:
                    hourly_patterns[hour] = {'total': 0, 'by_type': {}}
                hourly_patterns[hour]['total'] += count
                hourly_patterns[hour]['by_type'][interaction_type] = (
                    hourly_patterns[hour]['by_type'].get(interaction_type, 0) + count
                )

                # Daily totals
                if date_str not in daily_totals:
                    daily_totals[date_str] = 0
                daily_totals[date_str] += count

                # Interaction trends
                if interaction_type not in interaction_trends:
                    interaction_trends[interaction_type] = {}
                interaction_trends[interaction_type][date_str] = (
                    interaction_trends[interaction_type].get(date_str, 0) + count
                )

            # Find peak activity hours
            peak_hours = sorted(
                hourly_patterns.items(),
                key=lambda x: x[1]['total'],
                reverse=True
            )[:3]

            # Calculate consistency score (lower variance = more consistent)
            daily_counts = list(daily_totals.values())
            if daily_counts:
                avg_daily = sum(daily_counts) / len(daily_counts)
                variance = sum((x - avg_daily) ** 2 for x in daily_counts) / len(daily_counts)
                consistency_score = max(0, 100 - (variance / max(avg_daily, 1)) * 100)
            else:
                consistency_score = 0

            return {
                'analysis_period': f"{days} days",
                'total_interactions': sum(daily_totals.values()),
                'active_days': len(daily_totals),
                'avg_daily_interactions': round(sum(daily_totals.values()) / max(len(daily_totals), 1), 2),
                'consistency_score': round(consistency_score, 2),
                'peak_activity_hours': [
                    {'hour': hour, 'interactions': data['total']}
                    for hour, data in peak_hours
                ],
                'hourly_patterns': hourly_patterns,
                'daily_totals': daily_totals,
                'interaction_trends': interaction_trends
            }

        except Exception as e:
            logger.error(f"Error analyzing interaction patterns for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to analyze interaction patterns: {str(e)}")

    async def get_content_preference_analysis(
        self,
        user_id: str,
        min_interactions: int = 5
    ) -> Dict[str, Any]:
        """
        Analyze user's content preferences based on interactions.
        
        Args:
            user_id: User ID
            min_interactions: Minimum interactions required for analysis
            
        Returns:
            Dictionary with content preference analysis
        """
        try:
            # Get interaction data with joke metadata
            query = (
                select(
                    Joke.category,
                    Joke.rating,
                    func.length(Joke.text).label('text_length'),
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('interaction_count')
                )
                .join(Joke, JokeInteraction.joke_id == Joke.id)
                .where(JokeInteraction.user_id == user_id)
                .group_by(
                    Joke.category,
                    Joke.rating,
                    func.length(Joke.text),
                    JokeInteraction.interaction_type
                )
                .having(func.count(JokeInteraction.id) >= min_interactions)
            )

            result = await self.session.execute(query)
            interaction_data = result.fetchall()

            if not interaction_data:
                return {
                    'analysis_status': 'insufficient_data',
                    'min_interactions_required': min_interactions,
                    'preferences': {}
                }

            # Analyze category preferences
            category_scores = {}
            rating_preferences = {}
            length_preferences = {'short': 0, 'medium': 0, 'long': 0}

            for category, rating, text_length, interaction_type, count in interaction_data:
                # Category analysis
                if category:
                    if category not in category_scores:
                        category_scores[category] = {'positive': 0, 'negative': 0, 'neutral': 0}
                    
                    if interaction_type in ['like', 'share']:
                        category_scores[category]['positive'] += count
                    elif interaction_type in ['skip', 'report']:
                        category_scores[category]['negative'] += count
                    else:
                        category_scores[category]['neutral'] += count

                # Rating preferences
                rating_bucket = self._get_rating_bucket(rating)
                if rating_bucket not in rating_preferences:
                    rating_preferences[rating_bucket] = {'positive': 0, 'negative': 0}
                
                if interaction_type in ['like', 'share']:
                    rating_preferences[rating_bucket]['positive'] += count
                elif interaction_type in ['skip', 'report']:
                    rating_preferences[rating_bucket]['negative'] += count

                # Length preferences
                length_bucket = self._get_length_bucket(text_length)
                if interaction_type in ['like', 'share']:
                    length_preferences[length_bucket] += count

            # Calculate preference scores
            preferred_categories = []
            for category, scores in category_scores.items():
                total = sum(scores.values())
                if total > 0:
                    preference_score = (scores['positive'] - scores['negative']) / total
                    preferred_categories.append({
                        'category': category,
                        'preference_score': round(preference_score, 3),
                        'total_interactions': total,
                        'breakdown': scores
                    })

            preferred_categories.sort(key=lambda x: x['preference_score'], reverse=True)

            return {
                'analysis_status': 'success',
                'total_analyzed_interactions': len(interaction_data),
                'preferred_categories': preferred_categories[:10],  # Top 10
                'rating_preferences': rating_preferences,
                'length_preferences': length_preferences,
                'recommendations': self._generate_content_recommendations(
                    preferred_categories,
                    rating_preferences,
                    length_preferences
                )
            }

        except Exception as e:
            logger.error(f"Error analyzing content preferences for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to analyze content preferences: {str(e)}")

    # Cohort and Comparative Analysis

    async def get_user_cohort_analysis(
        self,
        user_id: str,
        cohort_size: int = 100
    ) -> Dict[str, Any]:
        """
        Compare user behavior to similar users (cohort analysis).
        
        Args:
            user_id: User ID
            cohort_size: Size of comparison cohort
            
        Returns:
            Dictionary with cohort comparison
        """
        try:
            # Get user's basic stats
            user_stats = await self.get_user_sentiment_stats(user_id)
            
            if user_stats['total_interactions'] == 0:
                return {
                    'analysis_status': 'insufficient_user_data',
                    'user_stats': user_stats
                }

            # Find similar users based on activity level
            user_activity = user_stats['total_interactions']
            activity_range = max(user_activity * 0.5, 10)

            similar_users_query = (
                select(
                    UserStats.user_id,
                    (UserStats.jokes_viewed + UserStats.jokes_liked + UserStats.jokes_skipped).label('total_activity')
                )
                .where(
                    and_(
                        UserStats.user_id != user_id,
                        (UserStats.jokes_viewed + UserStats.jokes_liked + UserStats.jokes_skipped).between(
                            user_activity - activity_range,
                            user_activity + activity_range
                        )
                    )
                )
                .order_by(func.random())
                .limit(cohort_size)
            )

            result = await self.session.execute(similar_users_query)
            cohort_user_ids = [row[0] for row in result.fetchall()]

            if len(cohort_user_ids) < 10:  # Need minimum cohort size
                return {
                    'analysis_status': 'insufficient_cohort_data',
                    'cohort_size': len(cohort_user_ids),
                    'user_stats': user_stats
                }

            # Get cohort interaction statistics
            cohort_stats = []
            for cohort_user_id in cohort_user_ids:
                stats = await self.get_user_sentiment_stats(cohort_user_id)
                cohort_stats.append(stats)

            # Calculate cohort averages
            avg_sentiment_score = sum(s['sentiment_score'] for s in cohort_stats) / len(cohort_stats)
            avg_interactions = sum(s['total_interactions'] for s in cohort_stats) / len(cohort_stats)
            
            sentiment_distribution = {}
            for stats in cohort_stats:
                sentiment = stats['sentiment']
                sentiment_distribution[sentiment] = sentiment_distribution.get(sentiment, 0) + 1

            # Calculate percentiles
            sentiment_scores = [s['sentiment_score'] for s in cohort_stats]
            sentiment_scores.sort()
            
            user_percentile = self._calculate_percentile(user_stats['sentiment_score'], sentiment_scores)

            return {
                'analysis_status': 'success',
                'cohort_size': len(cohort_user_ids),
                'user_stats': user_stats,
                'cohort_comparison': {
                    'user_sentiment_score': user_stats['sentiment_score'],
                    'cohort_avg_sentiment_score': round(avg_sentiment_score, 3),
                    'user_percentile': round(user_percentile, 1),
                    'user_vs_cohort': 'above_average' if user_stats['sentiment_score'] > avg_sentiment_score else 'below_average',
                    'cohort_avg_interactions': round(avg_interactions, 1),
                    'cohort_sentiment_distribution': sentiment_distribution
                },
                'insights': self._generate_cohort_insights(
                    user_stats,
                    avg_sentiment_score,
                    user_percentile
                )
            }

        except Exception as e:
            logger.error(f"Error in cohort analysis for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to perform cohort analysis: {str(e)}")

    # Bulk Operations

    async def bulk_record_interactions(
        self,
        interactions: List[Dict[str, Any]]
    ) -> List[JokeInteraction]:
        """
        Bulk record multiple interactions.
        
        Args:
            interactions: List of interaction dictionaries
            
        Returns:
            List of created interactions
        """
        try:
            created_interactions = []

            for interaction_data in interactions:
                try:
                    interaction = await self.record_feedback(
                        user_id=interaction_data.get('user_id'),
                        joke_id=interaction_data.get('joke_id'),
                        interaction_type=interaction_data.get('interaction_type'),
                        feedback_data=interaction_data.get('feedback_data')
                    )
                    created_interactions.append(interaction)
                except Exception as e:
                    logger.warning(f"Failed to record interaction: {str(e)}")
                    continue

            logger.info(f"Bulk recorded {len(created_interactions)} interactions")
            return created_interactions

        except Exception as e:
            logger.error(f"Error in bulk interaction recording: {str(e)}")
            raise RepositoryError(f"Failed to bulk record interactions: {str(e)}")

    async def get_interaction_summary_report(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """
        Generate comprehensive interaction summary report for date range.
        
        Args:
            start_date: Start date for analysis
            end_date: End date for analysis
            
        Returns:
            Dictionary with comprehensive interaction summary
        """
        try:
            # Total interactions by type
            type_query = (
                select(
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('count'),
                    func.count(func.distinct(JokeInteraction.user_id)).label('unique_users')
                )
                .where(
                    and_(
                        JokeInteraction.created_at >= start_date,
                        JokeInteraction.created_at <= end_date
                    )
                )
                .group_by(JokeInteraction.interaction_type)
            )

            result = await self.session.execute(type_query)
            interaction_by_type = {
                row[0]: {'count': row[1], 'unique_users': row[2]}
                for row in result.fetchall()
            }

            # Daily breakdown
            daily_query = (
                select(
                    func.date(JokeInteraction.created_at).label('date'),
                    func.count(JokeInteraction.id).label('count')
                )
                .where(
                    and_(
                        JokeInteraction.created_at >= start_date,
                        JokeInteraction.created_at <= end_date
                    )
                )
                .group_by(func.date(JokeInteraction.created_at))
                .order_by(func.date(JokeInteraction.created_at))
            )

            result = await self.session.execute(daily_query)
            daily_breakdown = {
                row[0].strftime('%Y-%m-%d'): row[1]
                for row in result.fetchall()
            }

            # Top categories by interaction
            category_query = (
                select(
                    Joke.category,
                    func.count(JokeInteraction.id).label('interaction_count')
                )
                .join(Joke, JokeInteraction.joke_id == Joke.id)
                .where(
                    and_(
                        JokeInteraction.created_at >= start_date,
                        JokeInteraction.created_at <= end_date,
                        Joke.category.isnot(None)
                    )
                )
                .group_by(Joke.category)
                .order_by(desc(func.count(JokeInteraction.id)))
                .limit(10)
            )

            result = await self.session.execute(category_query)
            top_categories = [
                {'category': row[0], 'interactions': row[1]}
                for row in result.fetchall()
            ]

            # Calculate totals
            total_interactions = sum(data['count'] for data in interaction_by_type.values())
            total_unique_users = len(set().union(*[
                {data['unique_users']} for data in interaction_by_type.values()
            ]))

            return {
                'period': {
                    'start_date': start_date.strftime('%Y-%m-%d'),
                    'end_date': end_date.strftime('%Y-%m-%d'),
                    'days': (end_date - start_date).days + 1
                },
                'summary': {
                    'total_interactions': total_interactions,
                    'total_unique_users': total_unique_users,
                    'avg_daily_interactions': round(total_interactions / max((end_date - start_date).days + 1, 1), 2)
                },
                'interaction_by_type': interaction_by_type,
                'daily_breakdown': daily_breakdown,
                'top_categories': top_categories
            }

        except Exception as e:
            logger.error(f"Error generating interaction summary report: {str(e)}")
            raise RepositoryError(f"Failed to generate summary report: {str(e)}")

    # Helper Methods

    async def _update_interaction_stats(self, user_id: str, joke_id: str, interaction_type: str):
        """Update related statistics after interaction recording."""
        try:
            # Update joke stats
            joke_query = select(Joke).where(Joke.id == joke_id)
            result = await self.session.execute(joke_query)
            joke = result.scalar_one_or_none()

            if joke:
                if interaction_type == 'view':
                    joke.view_count += 1
                elif interaction_type == 'like':
                    joke.like_count += 1

                # Recalculate rating
                if joke.view_count > 0:
                    joke.rating = round((joke.like_count / joke.view_count) * 5, 2)

            # Update user stats
            user_stats_query = select(UserStats).where(UserStats.user_id == user_id)
            result = await self.session.execute(user_stats_query)
            user_stats = result.scalar_one_or_none()

            if not user_stats:
                user_stats = UserStats(user_id=user_id)
                self.session.add(user_stats)

            if interaction_type == 'view':
                user_stats.jokes_viewed += 1
            elif interaction_type == 'like':
                user_stats.jokes_liked += 1
            elif interaction_type == 'skip':
                user_stats.jokes_skipped += 1

            user_stats.last_active = datetime.utcnow()

            await self.session.flush()

        except Exception as e:
            logger.error(f"Error updating interaction stats: {str(e)}")

    def _get_rating_bucket(self, rating: float) -> str:
        """Bucket ratings into categories."""
        if rating >= 4.0:
            return 'high'
        elif rating >= 3.0:
            return 'medium'
        else:
            return 'low'

    def _get_length_bucket(self, text_length: int) -> str:
        """Bucket text lengths into categories."""
        if text_length < 100:
            return 'short'
        elif text_length < 300:
            return 'medium'
        else:
            return 'long'

    def _calculate_percentile(self, value: float, sorted_values: List[float]) -> float:
        """Calculate percentile of value in sorted list."""
        if not sorted_values:
            return 50.0
        
        position = 0
        for i, v in enumerate(sorted_values):
            if value <= v:
                position = i
                break
        else:
            position = len(sorted_values)

        return (position / len(sorted_values)) * 100

    def _generate_content_recommendations(
        self,
        preferred_categories: List[Dict[str, Any]],
        rating_preferences: Dict[str, Dict[str, int]],
        length_preferences: Dict[str, int]
    ) -> List[str]:
        """Generate content recommendations based on preferences."""
        recommendations = []

        if preferred_categories:
            top_category = preferred_categories[0]['category']
            recommendations.append(f"Show more jokes from '{top_category}' category")

        # Rating recommendations
        best_rating = max(rating_preferences.keys(), 
                         key=lambda x: rating_preferences[x]['positive']) if rating_preferences else None
        if best_rating:
            recommendations.append(f"Focus on {best_rating}-quality jokes")

        # Length recommendations
        best_length = max(length_preferences.keys(), 
                         key=lambda x: length_preferences[x]) if length_preferences else None
        if best_length:
            recommendations.append(f"User prefers {best_length} jokes")

        if not recommendations:
            recommendations.append("Need more interaction data for personalized recommendations")

        return recommendations

    def _generate_cohort_insights(
        self,
        user_stats: Dict[str, Any],
        avg_sentiment_score: float,
        user_percentile: float
    ) -> List[str]:
        """Generate insights from cohort analysis."""
        insights = []

        if user_percentile > 75:
            insights.append("User is in the top 25% of similar users for positive sentiment")
        elif user_percentile < 25:
            insights.append("User sentiment is below average compared to similar users")
        else:
            insights.append("User sentiment is typical for their activity level")

        if user_stats['engagement_level'] == 'high':
            insights.append("User shows high engagement with content")
        elif user_stats['engagement_level'] == 'low':
            insights.append("User could benefit from more engaging content")

        if user_stats['sentiment'] == SentimentType.POSITIVE.value:
            insights.append("User generally enjoys the content they interact with")
        elif user_stats['sentiment'] == SentimentType.NEGATIVE.value:
            insights.append("User may need better content curation")

        return insights