"""Category repository for tag and category operations."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, desc, asc, text
from sqlalchemy.orm import selectinload, joinedload
from datetime import datetime, timedelta
import logging

from .base import BaseRepository, RepositoryError, NotFoundError, ValidationError
from ..models import Category, Joke, JokeInteraction, Favorite, User

logger = logging.getLogger(__name__)


class CategoryRepository(BaseRepository[Category, Dict[str, Any], Dict[str, Any]]):
    """Repository for category and tag operations."""

    def __init__(self, session):
        super().__init__(Category, session)
        self._default_relationships = []

    async def get_specialized_query(self, **kwargs):
        """Base implementation for abstract method."""
        return select(self.model)

    # Core Category Management

    async def get_all_by_category(
        self,
        language: str = 'en',
        include_joke_count: bool = True,
        min_jokes: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get all categories with optional joke counts.
        
        Args:
            language: Language filter for joke counting
            include_joke_count: Whether to include joke counts
            min_jokes: Minimum number of jokes required for category to be included
            
        Returns:
            List of category dictionaries with metadata
        """
        try:
            if include_joke_count:
                # Query with joke counts
                query = (
                    select(
                        Category.id,
                        Category.name,
                        Category.display_name,
                        Category.description,
                        func.count(Joke.id).label('joke_count'),
                        func.avg(Joke.rating).label('avg_rating'),
                        func.sum(Joke.view_count).label('total_views')
                    )
                    .outerjoin(
                        Joke,
                        and_(
                            Joke.category == Category.name,
                            Joke.language == language
                        )
                    )
                    .group_by(
                        Category.id,
                        Category.name,
                        Category.display_name,
                        Category.description
                    )
                    .having(func.count(Joke.id) >= min_jokes)
                    .order_by(desc(func.count(Joke.id)))
                )

                result = await self.session.execute(query)
                categories = []
                
                for row in result.fetchall():
                    categories.append({
                        'id': row[0],
                        'name': row[1],
                        'display_name': row[2],
                        'description': row[3],
                        'joke_count': row[4] or 0,
                        'avg_rating': float(row[5]) if row[5] else 0.0,
                        'total_views': row[6] or 0,
                        'engagement_score': self._calculate_engagement_score(
                            row[4] or 0,  # joke_count
                            float(row[5]) if row[5] else 0.0,  # avg_rating
                            row[6] or 0   # total_views
                        )
                    })

                return categories

            else:
                # Simple category query
                query = select(Category).order_by(Category.display_name)
                result = await self.session.execute(query)
                categories = result.scalars().all()

                return [
                    {
                        'id': cat.id,
                        'name': cat.name,
                        'display_name': cat.display_name,
                        'description': cat.description
                    }
                    for cat in categories
                ]

        except Exception as e:
            logger.error(f"Error getting categories: {str(e)}")
            raise RepositoryError(f"Failed to get categories: {str(e)}")

    async def get_popular(
        self,
        language: str = 'en',
        time_window_days: int = 30,
        limit: int = 10,
        metric: str = 'interactions'
    ) -> List[Dict[str, Any]]:
        """
        Get popular categories based on different metrics.
        
        Args:
            language: Language filter
            time_window_days: Time window for popularity calculation
            limit: Maximum number of categories to return
            metric: Metric to use ('interactions', 'likes', 'views', 'favorites')
            
        Returns:
            List of popular categories with statistics
        """
        try:
            time_threshold = datetime.utcnow() - timedelta(days=time_window_days)

            if metric == 'interactions':
                # Based on total interactions
                query = (
                    select(
                        Joke.category,
                        func.count(JokeInteraction.id).label('interaction_count'),
                        func.count(func.distinct(JokeInteraction.user_id)).label('unique_users'),
                        func.avg(Joke.rating).label('avg_rating')
                    )
                    .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                    .where(
                        and_(
                            Joke.language == language,
                            Joke.category.isnot(None),
                            JokeInteraction.created_at >= time_threshold
                        )
                    )
                    .group_by(Joke.category)
                    .order_by(desc(func.count(JokeInteraction.id)))
                    .limit(limit)
                )

            elif metric == 'likes':
                # Based on likes
                query = (
                    select(
                        Joke.category,
                        func.count(JokeInteraction.id).label('like_count'),
                        func.count(func.distinct(JokeInteraction.user_id)).label('unique_users'),
                        func.avg(Joke.rating).label('avg_rating')
                    )
                    .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                    .where(
                        and_(
                            Joke.language == language,
                            Joke.category.isnot(None),
                            JokeInteraction.interaction_type == 'like',
                            JokeInteraction.created_at >= time_threshold
                        )
                    )
                    .group_by(Joke.category)
                    .order_by(desc(func.count(JokeInteraction.id)))
                    .limit(limit)
                )

            elif metric == 'views':
                # Based on views
                query = (
                    select(
                        Joke.category,
                        func.sum(Joke.view_count).label('total_views'),
                        func.count(func.distinct(Joke.id)).label('joke_count'),
                        func.avg(Joke.rating).label('avg_rating')
                    )
                    .where(
                        and_(
                            Joke.language == language,
                            Joke.category.isnot(None)
                        )
                    )
                    .group_by(Joke.category)
                    .order_by(desc(func.sum(Joke.view_count)))
                    .limit(limit)
                )

            elif metric == 'favorites':
                # Based on favorites
                query = (
                    select(
                        Joke.category,
                        func.count(Favorite.id).label('favorite_count'),
                        func.count(func.distinct(Favorite.user_id)).label('unique_users'),
                        func.avg(Joke.rating).label('avg_rating')
                    )
                    .join(Favorite, Joke.id == Favorite.joke_id)
                    .where(
                        and_(
                            Joke.language == language,
                            Joke.category.isnot(None),
                            Favorite.created_at >= time_threshold
                        )
                    )
                    .group_by(Joke.category)
                    .order_by(desc(func.count(Favorite.id)))
                    .limit(limit)
                )

            else:
                raise RepositoryError(f"Invalid metric: {metric}")

            result = await self.session.execute(query)
            rows = result.fetchall()

            # Get category details
            popular_categories = []
            for row in rows:
                category_name = row[0]
                
                # Get category details
                category_query = select(Category).where(Category.name == category_name)
                cat_result = await self.session.execute(category_query)
                category = cat_result.scalar_one_or_none()

                category_data = {
                    'name': category_name,
                    'display_name': category.display_name if category else category_name.title(),
                    'description': category.description if category else None,
                    'metric_value': row[1],
                    'metric_type': metric,
                    'time_window_days': time_window_days
                }

                # Add metric-specific data
                if len(row) > 2:
                    if metric in ['interactions', 'likes', 'favorites']:
                        category_data['unique_users'] = row[2]
                        category_data['avg_rating'] = float(row[3]) if row[3] else 0.0
                    elif metric == 'views':
                        category_data['joke_count'] = row[2]
                        category_data['avg_rating'] = float(row[3]) if row[3] else 0.0

                popular_categories.append(category_data)

            return popular_categories

        except Exception as e:
            logger.error(f"Error getting popular categories: {str(e)}")
            raise RepositoryError(f"Failed to get popular categories: {str(e)}")

    # Category Analytics

    async def get_category_trends(
        self,
        language: str = 'en',
        days: int = 30,
        interval: str = 'daily'
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get trending data for categories over time.
        
        Args:
            language: Language filter
            days: Number of days to analyze
            interval: Time interval ('daily', 'weekly')
            
        Returns:
            Dictionary with category trends
        """
        try:
            date_threshold = datetime.utcnow() - timedelta(days=days)

            # Determine date grouping based on interval
            if interval == 'daily':
                date_group = func.date(JokeInteraction.created_at)
            elif interval == 'weekly':
                # Group by week (ISO week)
                date_group = func.date_trunc('week', JokeInteraction.created_at)
            else:
                raise RepositoryError(f"Invalid interval: {interval}")

            # Query for trend data
            query = (
                select(
                    Joke.category,
                    date_group.label('time_period'),
                    func.count(JokeInteraction.id).label('interaction_count'),
                    func.count(func.distinct(JokeInteraction.user_id)).label('unique_users')
                )
                .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                .where(
                    and_(
                        Joke.language == language,
                        Joke.category.isnot(None),
                        JokeInteraction.created_at >= date_threshold
                    )
                )
                .group_by(
                    Joke.category,
                    date_group
                )
                .order_by(
                    Joke.category,
                    date_group
                )
            )

            result = await self.session.execute(query)
            rows = result.fetchall()

            # Organize data by category
            trends = {}
            for category, time_period, interaction_count, unique_users in rows:
                if category not in trends:
                    trends[category] = []

                trends[category].append({
                    'time_period': time_period.strftime('%Y-%m-%d') if hasattr(time_period, 'strftime') else str(time_period),
                    'interaction_count': interaction_count,
                    'unique_users': unique_users
                })

            return trends

        except Exception as e:
            logger.error(f"Error getting category trends: {str(e)}")
            raise RepositoryError(f"Failed to get category trends: {str(e)}")

    async def get_category_performance(
        self,
        category_name: str,
        language: str = 'en'
    ) -> Dict[str, Any]:
        """
        Get detailed performance metrics for a specific category.
        
        Args:
            category_name: Category name
            language: Language filter
            
        Returns:
            Dictionary with category performance metrics
        """
        try:
            # Get basic category info
            category_query = select(Category).where(Category.name == category_name)
            result = await self.session.execute(category_query)
            category = result.scalar_one_or_none()

            if not category:
                raise NotFoundError(f"Category '{category_name}' not found")

            # Get joke statistics
            joke_stats_query = (
                select(
                    func.count(Joke.id).label('total_jokes'),
                    func.avg(Joke.rating).label('avg_rating'),
                    func.sum(Joke.view_count).label('total_views'),
                    func.sum(Joke.like_count).label('total_likes'),
                    func.min(Joke.created_at).label('first_joke_date'),
                    func.max(Joke.created_at).label('latest_joke_date')
                )
                .where(
                    and_(
                        Joke.category == category_name,
                        Joke.language == language
                    )
                )
            )

            result = await self.session.execute(joke_stats_query)
            joke_stats = result.fetchone()

            # Get interaction statistics
            interaction_stats_query = (
                select(
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('count'),
                    func.count(func.distinct(JokeInteraction.user_id)).label('unique_users')
                )
                .join(Joke, JokeInteraction.joke_id == Joke.id)
                .where(
                    and_(
                        Joke.category == category_name,
                        Joke.language == language
                    )
                )
                .group_by(JokeInteraction.interaction_type)
            )

            result = await self.session.execute(interaction_stats_query)
            interaction_stats = {
                row[0]: {'count': row[1], 'unique_users': row[2]}
                for row in result.fetchall()
            }

            # Get favorite statistics
            favorite_stats_query = (
                select(
                    func.count(Favorite.id).label('total_favorites'),
                    func.count(func.distinct(Favorite.user_id)).label('unique_users')
                )
                .join(Joke, Favorite.joke_id == Joke.id)
                .where(
                    and_(
                        Joke.category == category_name,
                        Joke.language == language
                    )
                )
            )

            result = await self.session.execute(favorite_stats_query)
            favorite_stats = result.fetchone()

            # Calculate engagement metrics
            total_views = joke_stats[2] or 0
            total_likes = joke_stats[3] or 0
            engagement_rate = (total_likes / max(total_views, 1)) * 100

            return {
                'category': {
                    'name': category.name,
                    'display_name': category.display_name,
                    'description': category.description
                },
                'content_stats': {
                    'total_jokes': joke_stats[0] or 0,
                    'avg_rating': float(joke_stats[1]) if joke_stats[1] else 0.0,
                    'total_views': total_views,
                    'total_likes': total_likes,
                    'engagement_rate': round(engagement_rate, 2),
                    'first_joke_date': joke_stats[4],
                    'latest_joke_date': joke_stats[5]
                },
                'interaction_stats': interaction_stats,
                'favorite_stats': {
                    'total_favorites': favorite_stats[0] or 0,
                    'unique_users': favorite_stats[1] or 0
                }
            }

        except Exception as e:
            logger.error(f"Error getting performance for category {category_name}: {str(e)}")
            raise RepositoryError(f"Failed to get category performance: {str(e)}")

    # Category Management

    async def create_category(
        self,
        name: str,
        display_name: str,
        description: Optional[str] = None
    ) -> Category:
        """
        Create a new category.
        
        Args:
            name: Category name (slug)
            display_name: Human-readable display name
            description: Optional description
            
        Returns:
            Created category
        """
        try:
            # Validate name format
            if not name.replace('_', '').replace('-', '').isalnum():
                raise ValidationError("Category name must contain only letters, numbers, underscores, and hyphens")

            # Check if category already exists
            existing = await self.find_one_by(name=name)
            if existing:
                raise ValidationError(f"Category '{name}' already exists")

            category_data = {
                'name': name.lower(),
                'display_name': display_name,
                'description': description
            }

            category = await self.create(category_data)
            logger.info(f"Created new category: {name}")
            return category

        except Exception as e:
            logger.error(f"Error creating category {name}: {str(e)}")
            raise RepositoryError(f"Failed to create category: {str(e)}")

    async def update_category_counts(self) -> Dict[str, int]:
        """
        Update joke counts for all categories.
        
        Returns:
            Dictionary with updated counts by category
        """
        try:
            # Get current joke counts by category
            count_query = (
                select(
                    Joke.category,
                    func.count(Joke.id).label('joke_count')
                )
                .where(Joke.category.isnot(None))
                .group_by(Joke.category)
            )

            result = await self.session.execute(count_query)
            current_counts = {row[0]: row[1] for row in result.fetchall()}

            # Update category records
            updated_counts = {}
            for category_name, count in current_counts.items():
                category = await self.find_one_by(name=category_name)
                if category:
                    category.joke_count = count
                    updated_counts[category_name] = count
                else:
                    # Create category if it doesn't exist
                    await self.create_category(
                        name=category_name,
                        display_name=category_name.replace('_', ' ').title()
                    )
                    updated_counts[category_name] = count

            await self.session.commit()
            logger.info(f"Updated joke counts for {len(updated_counts)} categories")
            return updated_counts

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error updating category counts: {str(e)}")
            raise RepositoryError(f"Failed to update category counts: {str(e)}")

    # User-Category Relationships

    async def get_user_category_preferences(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get user's category preferences based on their interaction history.
        
        Args:
            user_id: User ID
            limit: Maximum number of categories to return
            
        Returns:
            List of preferred categories with scores
        """
        try:
            # Calculate preference scores based on interactions
            query = (
                select(
                    Joke.category,
                    func.count(
                        func.case(
                            (JokeInteraction.interaction_type == 'like', 1)
                        )
                    ).label('likes'),
                    func.count(
                        func.case(
                            (JokeInteraction.interaction_type == 'view', 1)
                        )
                    ).label('views'),
                    func.count(
                        func.case(
                            (JokeInteraction.interaction_type == 'skip', 1)
                        )
                    ).label('skips'),
                    func.count(Favorite.id).label('favorites')
                )
                .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                .outerjoin(
                    Favorite,
                    and_(
                        Favorite.joke_id == Joke.id,
                        Favorite.user_id == user_id
                    )
                )
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        Joke.category.isnot(None)
                    )
                )
                .group_by(Joke.category)
                .limit(limit)
            )

            result = await self.session.execute(query)
            rows = result.fetchall()

            preferences = []
            for category, likes, views, skips, favorites in rows:
                # Calculate preference score
                # Formula: (likes * 3 + favorites * 5 - skips) / views
                total_positive = (likes * 3) + (favorites * 5)
                total_negative = skips
                total_interactions = views

                preference_score = (
                    (total_positive - total_negative) / max(total_interactions, 1)
                ) * 100

                # Get category details
                category_query = select(Category).where(Category.name == category)
                cat_result = await self.session.execute(category_query)
                category_obj = cat_result.scalar_one_or_none()

                preferences.append({
                    'category': category,
                    'display_name': category_obj.display_name if category_obj else category.title(),
                    'preference_score': round(preference_score, 2),
                    'interactions': {
                        'likes': likes,
                        'views': views,
                        'skips': skips,
                        'favorites': favorites
                    }
                })

            # Sort by preference score
            preferences.sort(key=lambda x: x['preference_score'], reverse=True)
            return preferences

        except Exception as e:
            logger.error(f"Error getting user category preferences for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get user category preferences: {str(e)}")

    async def suggest_categories_for_user(
        self,
        user_id: str,
        exclude_seen: bool = True,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Suggest new categories for a user to explore.
        
        Args:
            user_id: User ID
            exclude_seen: Whether to exclude categories user has already seen
            limit: Maximum number of suggestions
            
        Returns:
            List of suggested categories
        """
        try:
            # Get categories user has already interacted with
            if exclude_seen:
                seen_categories_query = (
                    select(func.distinct(Joke.category))
                    .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                    .where(JokeInteraction.user_id == user_id)
                )
                result = await self.session.execute(seen_categories_query)
                seen_categories = [row[0] for row in result.fetchall() if row[0]]
            else:
                seen_categories = []

            # Get popular categories that user hasn't seen
            popular_query = (
                select(
                    Joke.category,
                    func.count(JokeInteraction.id).label('popularity_score'),
                    func.avg(Joke.rating).label('avg_rating'),
                    func.count(func.distinct(Joke.id)).label('joke_count')
                )
                .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                .where(
                    and_(
                        Joke.category.isnot(None),
                        Joke.category.notin_(seen_categories) if seen_categories else True
                    )
                )
                .group_by(Joke.category)
                .having(func.count(func.distinct(Joke.id)) >= 5)  # At least 5 jokes
                .order_by(desc(func.count(JokeInteraction.id)))
                .limit(limit)
            )

            result = await self.session.execute(popular_query)
            rows = result.fetchall()

            suggestions = []
            for category, popularity_score, avg_rating, joke_count in rows:
                # Get category details
                category_query = select(Category).where(Category.name == category)
                cat_result = await self.session.execute(category_query)
                category_obj = cat_result.scalar_one_or_none()

                suggestions.append({
                    'category': category,
                    'display_name': category_obj.display_name if category_obj else category.title(),
                    'description': category_obj.description if category_obj else None,
                    'popularity_score': popularity_score,
                    'avg_rating': float(avg_rating) if avg_rating else 0.0,
                    'joke_count': joke_count,
                    'reason': 'popular_unexplored'
                })

            return suggestions

        except Exception as e:
            logger.error(f"Error suggesting categories for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to suggest categories: {str(e)}")

    # Helper Methods

    def _calculate_engagement_score(
        self,
        joke_count: int,
        avg_rating: float,
        total_views: int
    ) -> float:
        """Calculate engagement score for a category."""
        if joke_count == 0:
            return 0.0

        # Normalize factors
        content_factor = min(joke_count / 100, 1.0)  # Up to 100 jokes
        quality_factor = avg_rating / 5.0  # Rating out of 5
        popularity_factor = min(total_views / 10000, 1.0)  # Up to 10k views

        # Weighted average
        engagement_score = (
            content_factor * 0.3 +
            quality_factor * 0.4 +
            popularity_factor * 0.3
        ) * 100

        return round(engagement_score, 2)

    # Bulk Operations

    async def bulk_create_categories(
        self,
        categories: List[Dict[str, str]]
    ) -> List[Category]:
        """
        Bulk create categories.
        
        Args:
            categories: List of category dictionaries
            
        Returns:
            List of created categories
        """
        try:
            created_categories = []

            for cat_data in categories:
                try:
                    category = await self.create_category(
                        name=cat_data.get('name', ''),
                        display_name=cat_data.get('display_name', ''),
                        description=cat_data.get('description')
                    )
                    created_categories.append(category)
                except ValidationError as e:
                    logger.warning(f"Skipped category creation: {str(e)}")
                    continue

            logger.info(f"Bulk created {len(created_categories)} categories")
            return created_categories

        except Exception as e:
            logger.error(f"Error bulk creating categories: {str(e)}")
            raise RepositoryError(f"Failed to bulk create categories: {str(e)}")

    async def get_category_health_report(self) -> Dict[str, Any]:
        """
        Get a comprehensive health report for all categories.
        
        Returns:
            Dictionary with category health metrics
        """
        try:
            # Get all categories with their statistics
            categories = await self.get_all_by_category(include_joke_count=True)

            # Calculate health metrics
            total_categories = len(categories)
            active_categories = len([c for c in categories if c['joke_count'] > 0])
            well_populated = len([c for c in categories if c['joke_count'] >= 10])
            high_quality = len([c for c in categories if c['avg_rating'] >= 4.0])

            # Get top and bottom performers
            top_performers = sorted(categories, key=lambda x: x['engagement_score'], reverse=True)[:5]
            underperformers = [c for c in categories if c['joke_count'] < 5 and c['engagement_score'] < 20]

            return {
                'overview': {
                    'total_categories': total_categories,
                    'active_categories': active_categories,
                    'well_populated_categories': well_populated,
                    'high_quality_categories': high_quality,
                    'activity_rate': round((active_categories / max(total_categories, 1)) * 100, 2)
                },
                'top_performers': top_performers,
                'underperformers': underperformers,
                'recommendations': self._generate_category_recommendations(
                    total_categories,
                    active_categories,
                    underperformers
                )
            }

        except Exception as e:
            logger.error(f"Error generating category health report: {str(e)}")
            raise RepositoryError(f"Failed to generate health report: {str(e)}")

    def _generate_category_recommendations(
        self,
        total_categories: int,
        active_categories: int,
        underperformers: List[Dict[str, Any]]
    ) -> List[str]:
        """Generate recommendations based on category health."""
        recommendations = []

        if active_categories < total_categories * 0.5:
            recommendations.append("Consider removing inactive categories or adding content to them")

        if len(underperformers) > total_categories * 0.3:
            recommendations.append("Focus on improving content quality for underperforming categories")

        if total_categories < 10:
            recommendations.append("Consider adding more categories to increase content diversity")

        if not recommendations:
            recommendations.append("Category health looks good! Continue monitoring engagement metrics")

        return recommendations