"""User repository with specialized user management operations."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, desc, asc
from sqlalchemy.orm import selectinload, joinedload
from datetime import datetime, timedelta
import logging
import uuid

from .base import BaseRepository, RepositoryError, NotFoundError, ValidationError
from ..models import User, UserStats, JokeInteraction, Favorite, Joke

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository[User, Dict[str, Any], Dict[str, Any]]):
    """Repository for user-specific operations."""

    def __init__(self, session):
        super().__init__(User, session)
        self._default_relationships = ['user_stats', 'favorites', 'joke_interactions']

    async def get_specialized_query(self, **kwargs):
        """Base implementation for abstract method."""
        return select(self.model)

    # Core User Management Methods

    async def get_or_create_by_device_uuid(
        self,
        device_uuid: str,
        username: Optional[str] = None,
        email: Optional[str] = None,
        preferred_language: str = 'en'
    ) -> Tuple[User, bool]:
        """
        Get user by device UUID or create if not exists.
        
        Args:
            device_uuid: Unique device identifier
            username: Username (generated if not provided)
            email: User email (optional)
            preferred_language: User's preferred language
            
        Returns:
            Tuple of (User, created_flag)
        """
        try:
            # For this implementation, we'll use device_uuid as username
            # In a real app, you might store device_uuid separately
            existing_user = await self.find_one_by(username=device_uuid)
            
            if existing_user:
                logger.debug(f"Found existing user for device {device_uuid}")
                return existing_user, False

            # Generate username if not provided
            if not username:
                username = device_uuid

            # Generate email if not provided
            if not email:
                email = f"user_{device_uuid}@giggleglide.app"

            # Create new user
            user_data = {
                'username': username,
                'email': email,
                'preferred_language': preferred_language
            }

            # Validate user data
            await self._validate_create(user_data)

            # Create user
            user = User(**user_data)
            self.session.add(user)
            await self.session.flush()
            await self.session.refresh(user)

            # Create associated user stats
            user_stats = UserStats(user_id=user.id)
            self.session.add(user_stats)
            await self.session.flush()

            await self.session.commit()
            
            logger.info(f"Created new user for device {device_uuid}")
            return user, True

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error getting/creating user for device {device_uuid}: {str(e)}")
            raise RepositoryError(f"Failed to get or create user: {str(e)}")

    async def update_preferences(
        self,
        user_id: str,
        preferences: Dict[str, Any]
    ) -> User:
        """
        Update user preferences.
        
        Args:
            user_id: User ID
            preferences: Dictionary of preferences to update
            
        Returns:
            Updated user
        """
        try:
            # Get existing user
            user = await self.get(user_id)
            if not user:
                raise NotFoundError(f"User with id {user_id} not found")

            # Define allowed preference fields
            allowed_fields = {
                'preferred_language',
                'dark_mode',
                'notifications_enabled',
                'notification_time'
            }

            # Filter preferences to only allowed fields
            filtered_preferences = {
                k: v for k, v in preferences.items() 
                if k in allowed_fields
            }

            if not filtered_preferences:
                logger.warning(f"No valid preferences provided for user {user_id}")
                return user

            # Validate preferences
            await self._validate_preferences(filtered_preferences)

            # Update user preferences
            for field, value in filtered_preferences.items():
                if hasattr(user, field):
                    setattr(user, field, value)

            # Update timestamp
            user.updated_at = datetime.utcnow()

            await self.session.commit()
            await self.session.refresh(user)

            logger.info(f"Updated preferences for user {user_id}: {list(filtered_preferences.keys())}")
            return user

        except NotFoundError:
            raise
        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error updating preferences for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to update user preferences: {str(e)}")

    async def get_user_profile(self, user_id: str) -> Dict[str, Any]:
        """
        Get comprehensive user profile with statistics.
        
        Args:
            user_id: User ID
            
        Returns:
            Dictionary with user profile and statistics
        """
        try:
            # Get user with relationships
            user = await self.get(
                user_id,
                relationships=['user_stats', 'favorites'],
                raise_not_found=True
            )

            # Get interaction statistics
            interaction_stats = await self._get_user_interaction_stats(user_id)

            # Get favorite categories
            favorite_categories = await self._get_user_favorite_categories(user_id)

            # Get recent activity
            recent_activity = await self._get_recent_activity(user_id, limit=10)

            profile = {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'preferred_language': user.preferred_language,
                'dark_mode': user.dark_mode,
                'notifications_enabled': user.notifications_enabled,
                'notification_time': user.notification_time,
                'created_at': user.created_at,
                'updated_at': user.updated_at,
                'statistics': {
                    'jokes_viewed': user.user_stats.jokes_viewed if user.user_stats else 0,
                    'jokes_liked': user.user_stats.jokes_liked if user.user_stats else 0,
                    'jokes_skipped': user.user_stats.jokes_skipped if user.user_stats else 0,
                    'favorites_count': len(user.favorites),
                    'last_active': user.user_stats.last_active if user.user_stats else None,
                    'interaction_stats': interaction_stats,
                    'favorite_categories': favorite_categories
                },
                'recent_activity': recent_activity
            }

            return profile

        except Exception as e:
            logger.error(f"Error getting user profile for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get user profile: {str(e)}")

    # User Discovery and Social Features

    async def get_users_by_activity(
        self,
        activity_threshold_days: int = 7,
        min_interactions: int = 10,
        limit: int = 50
    ) -> List[User]:
        """
        Get active users based on recent activity.
        
        Args:
            activity_threshold_days: Days to look back for activity
            min_interactions: Minimum number of interactions required
            limit: Maximum number of users to return
            
        Returns:
            List of active users
        """
        try:
            activity_threshold = datetime.utcnow() - timedelta(days=activity_threshold_days)

            # Subquery for users with recent activity
            active_users_subquery = (
                select(
                    UserStats.user_id,
                    (UserStats.jokes_viewed + UserStats.jokes_liked + UserStats.jokes_skipped).label('total_interactions')
                )
                .where(
                    and_(
                        UserStats.last_active >= activity_threshold,
                        (UserStats.jokes_viewed + UserStats.jokes_liked + UserStats.jokes_skipped) >= min_interactions
                    )
                )
                .subquery()
            )

            # Main query
            query = (
                select(User)
                .join(active_users_subquery, User.id == active_users_subquery.c.user_id)
                .order_by(desc(active_users_subquery.c.total_interactions))
                .limit(limit)
                .options(selectinload(User.user_stats))
            )

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting active users: {str(e)}")
            raise RepositoryError(f"Failed to get active users: {str(e)}")

    async def get_users_with_similar_preferences(
        self,
        user_id: str,
        limit: int = 20
    ) -> List[User]:
        """
        Find users with similar joke preferences.
        
        Args:
            user_id: Reference user ID
            limit: Maximum number of similar users to return
            
        Returns:
            List of users with similar preferences
        """
        try:
            # Get the reference user's favorite categories
            user_categories = await self._get_user_favorite_categories(user_id, limit=5)
            
            if not user_categories:
                return []

            category_names = [cat['category'] for cat in user_categories]

            # Find users who like similar categories
            similar_users_query = (
                select(
                    User.id,
                    User.username,
                    func.count(Joke.category).label('common_categories')
                )
                .join(Favorite, User.id == Favorite.user_id)
                .join(Joke, Favorite.joke_id == Joke.id)
                .where(
                    and_(
                        Joke.category.in_(category_names),
                        User.id != user_id
                    )
                )
                .group_by(User.id, User.username)
                .having(func.count(Joke.category) >= 2)  # At least 2 common categories
                .order_by(desc(func.count(Joke.category)))
                .limit(limit)
            )

            result = await self.session.execute(similar_users_query)
            user_ids = [row[0] for row in result.fetchall()]

            # Get full user objects
            if user_ids:
                users_query = (
                    select(User)
                    .where(User.id.in_(user_ids))
                    .options(selectinload(User.user_stats))
                )
                result = await self.session.execute(users_query)
                return result.scalars().all()

            return []

        except Exception as e:
            logger.error(f"Error finding similar users for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to find similar users: {str(e)}")

    # User Analytics and Statistics

    async def get_user_engagement_metrics(
        self,
        user_id: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get detailed engagement metrics for a user.
        
        Args:
            user_id: User ID
            days: Number of days to analyze
            
        Returns:
            Dictionary with engagement metrics
        """
        try:
            date_threshold = datetime.utcnow() - timedelta(days=days)

            # Get daily interaction counts
            daily_interactions_query = (
                select(
                    func.date(JokeInteraction.created_at).label('date'),
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
                    JokeInteraction.interaction_type
                )
                .order_by(func.date(JokeInteraction.created_at))
            )

            result = await self.session.execute(daily_interactions_query)
            daily_data = result.fetchall()

            # Process daily data
            daily_metrics = {}
            for date, interaction_type, count in daily_data:
                date_str = date.strftime('%Y-%m-%d')
                if date_str not in daily_metrics:
                    daily_metrics[date_str] = {'view': 0, 'like': 0, 'skip': 0}
                daily_metrics[date_str][interaction_type] = count

            # Calculate engagement ratios
            total_views = sum(day.get('view', 0) for day in daily_metrics.values())
            total_likes = sum(day.get('like', 0) for day in daily_metrics.values())
            total_skips = sum(day.get('skip', 0) for day in daily_metrics.values())

            engagement_rate = (total_likes / max(total_views, 1)) * 100
            skip_rate = (total_skips / max(total_views, 1)) * 100

            # Get streak information
            activity_streak = await self._calculate_activity_streak(user_id)

            return {
                'period_days': days,
                'total_interactions': total_views + total_likes + total_skips,
                'total_views': total_views,
                'total_likes': total_likes,
                'total_skips': total_skips,
                'engagement_rate': round(engagement_rate, 2),
                'skip_rate': round(skip_rate, 2),
                'activity_streak': activity_streak,
                'daily_breakdown': daily_metrics,
                'avg_daily_interactions': round((total_views + total_likes + total_skips) / max(days, 1), 2)
            }

        except Exception as e:
            logger.error(f"Error getting engagement metrics for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get engagement metrics: {str(e)}")

    # User Management Operations

    async def deactivate_user(self, user_id: str) -> bool:
        """
        Deactivate a user account (soft delete).
        
        Args:
            user_id: User ID
            
        Returns:
            True if deactivated successfully
        """
        try:
            user = await self.get(user_id)
            if not user:
                return False

            # In this simple implementation, we'll add an 'active' field concept
            # For now, we'll update the username to indicate deactivation
            user.username = f"deactivated_{user.username}_{int(datetime.utcnow().timestamp())}"
            user.email = f"deactivated_{user.email}"
            user.updated_at = datetime.utcnow()

            await self.session.commit()
            
            logger.info(f"Deactivated user {user_id}")
            return True

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error deactivating user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to deactivate user: {str(e)}")

    async def merge_users(
        self,
        primary_user_id: str,
        secondary_user_id: str
    ) -> User:
        """
        Merge two user accounts (move data from secondary to primary).
        
        Args:
            primary_user_id: ID of user to keep
            secondary_user_id: ID of user to merge and remove
            
        Returns:
            Updated primary user
        """
        try:
            # Get both users
            primary_user = await self.get(primary_user_id)
            secondary_user = await self.get(secondary_user_id)

            if not primary_user or not secondary_user:
                raise NotFoundError("One or both users not found")

            # Move favorites
            favorites_update_query = (
                update(Favorite)
                .where(Favorite.user_id == secondary_user_id)
                .values(user_id=primary_user_id)
            )
            await self.session.execute(favorites_update_query)

            # Move interactions
            interactions_update_query = (
                update(JokeInteraction)
                .where(JokeInteraction.user_id == secondary_user_id)
                .values(user_id=primary_user_id)
            )
            await self.session.execute(interactions_update_query)

            # Merge user stats
            primary_stats = await self._get_or_create_user_stats(primary_user_id)
            secondary_stats = await self._get_or_create_user_stats(secondary_user_id)

            primary_stats.jokes_viewed += secondary_stats.jokes_viewed
            primary_stats.jokes_liked += secondary_stats.jokes_liked
            primary_stats.jokes_skipped += secondary_stats.jokes_skipped

            # Keep the most recent last_active
            if (secondary_stats.last_active and 
                (not primary_stats.last_active or secondary_stats.last_active > primary_stats.last_active)):
                primary_stats.last_active = secondary_stats.last_active

            # Delete secondary user and stats
            await self.session.delete(secondary_stats)
            await self.session.delete(secondary_user)

            await self.session.commit()
            await self.session.refresh(primary_user)

            logger.info(f"Merged user {secondary_user_id} into {primary_user_id}")
            return primary_user

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error merging users {secondary_user_id} -> {primary_user_id}: {str(e)}")
            raise RepositoryError(f"Failed to merge users: {str(e)}")

    # Helper Methods

    async def _validate_create(self, obj_data: Dict[str, Any]) -> None:
        """Validate user creation data."""
        # Check if username already exists
        if 'username' in obj_data:
            existing = await self.find_one_by(username=obj_data['username'])
            if existing:
                raise ValidationError(f"Username '{obj_data['username']}' already exists")

        # Check if email already exists
        if 'email' in obj_data:
            existing = await self.find_one_by(email=obj_data['email'])
            if existing:
                raise ValidationError(f"Email '{obj_data['email']}' already exists")

    async def _validate_preferences(self, preferences: Dict[str, Any]) -> None:
        """Validate user preferences."""
        if 'preferred_language' in preferences:
            valid_languages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh']
            if preferences['preferred_language'] not in valid_languages:
                raise ValidationError(f"Invalid language: {preferences['preferred_language']}")

        if 'notification_time' in preferences:
            time_str = preferences['notification_time']
            try:
                datetime.strptime(time_str, '%H:%M')
            except ValueError:
                raise ValidationError(f"Invalid notification time format: {time_str}")

    async def _get_user_interaction_stats(self, user_id: str) -> Dict[str, int]:
        """Get detailed interaction statistics for a user."""
        query = (
            select(
                JokeInteraction.interaction_type,
                func.count(JokeInteraction.id).label('count')
            )
            .where(JokeInteraction.user_id == user_id)
            .group_by(JokeInteraction.interaction_type)
        )

        result = await self.session.execute(query)
        return {row[0]: row[1] for row in result.fetchall()}

    async def _get_user_favorite_categories(
        self,
        user_id: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Get user's favorite joke categories."""
        query = (
            select(
                Joke.category,
                func.count(Joke.category).label('count')
            )
            .join(Favorite, Joke.id == Favorite.joke_id)
            .where(
                and_(
                    Favorite.user_id == user_id,
                    Joke.category.isnot(None)
                )
            )
            .group_by(Joke.category)
            .order_by(desc(func.count(Joke.category)))
            .limit(limit)
        )

        result = await self.session.execute(query)
        return [
            {'category': row[0], 'count': row[1]}
            for row in result.fetchall()
        ]

    async def _get_recent_activity(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get user's recent activity."""
        query = (
            select(JokeInteraction)
            .where(JokeInteraction.user_id == user_id)
            .order_by(desc(JokeInteraction.created_at))
            .limit(limit)
            .options(selectinload(JokeInteraction.joke))
        )

        result = await self.session.execute(query)
        interactions = result.scalars().all()

        activity = []
        for interaction in interactions:
            activity.append({
                'type': interaction.interaction_type,
                'joke_id': interaction.joke_id,
                'joke_category': interaction.joke.category if interaction.joke else None,
                'timestamp': interaction.created_at
            })

        return activity

    async def _calculate_activity_streak(self, user_id: str) -> int:
        """Calculate the user's current activity streak in days."""
        try:
            # Get the user's interactions ordered by date
            query = (
                select(func.date(JokeInteraction.created_at).label('activity_date'))
                .where(JokeInteraction.user_id == user_id)
                .group_by(func.date(JokeInteraction.created_at))
                .order_by(desc(func.date(JokeInteraction.created_at)))
            )

            result = await self.session.execute(query)
            activity_dates = [row[0] for row in result.fetchall()]

            if not activity_dates:
                return 0

            # Calculate streak
            streak = 0
            current_date = datetime.utcnow().date()

            for activity_date in activity_dates:
                expected_date = current_date - timedelta(days=streak)
                if activity_date == expected_date:
                    streak += 1
                elif activity_date == expected_date - timedelta(days=1):
                    # Allow for one day gap (yesterday)
                    streak += 1
                else:
                    break

            return streak

        except Exception as e:
            logger.error(f"Error calculating activity streak for user {user_id}: {str(e)}")
            return 0

    async def _get_or_create_user_stats(self, user_id: str) -> UserStats:
        """Get or create user stats record."""
        query = select(UserStats).where(UserStats.user_id == user_id)
        result = await self.session.execute(query)
        stats = result.scalar_one_or_none()

        if not stats:
            stats = UserStats(user_id=user_id)
            self.session.add(stats)
            await self.session.flush()

        return stats

    # Bulk Operations for User Management

    async def bulk_update_preferences(
        self,
        user_preference_updates: List[Dict[str, Any]]
    ) -> int:
        """
        Bulk update user preferences.
        
        Args:
            user_preference_updates: List of dicts with 'user_id' and preference fields
            
        Returns:
            Number of users updated
        """
        try:
            updated_count = 0

            for update_data in user_preference_updates:
                if 'user_id' not in update_data:
                    continue

                user_id = update_data.pop('user_id')
                
                try:
                    await self.update_preferences(user_id, update_data)
                    updated_count += 1
                except Exception as e:
                    logger.warning(f"Failed to update preferences for user {user_id}: {str(e)}")
                    continue

            logger.info(f"Bulk updated preferences for {updated_count} users")
            return updated_count

        except Exception as e:
            logger.error(f"Error in bulk preference update: {str(e)}")
            raise RepositoryError(f"Failed to bulk update preferences: {str(e)}")

    async def cleanup_inactive_users(
        self,
        inactive_days: int = 365,
        dry_run: bool = True
    ) -> List[str]:
        """
        Identify and optionally remove inactive users.
        
        Args:
            inactive_days: Days of inactivity threshold
            dry_run: If True, only return IDs without deleting
            
        Returns:
            List of inactive user IDs
        """
        try:
            inactive_threshold = datetime.utcnow() - timedelta(days=inactive_days)

            # Find users with no recent activity
            inactive_query = (
                select(User.id)
                .outerjoin(UserStats, User.id == UserStats.user_id)
                .where(
                    or_(
                        UserStats.last_active.is_(None),
                        UserStats.last_active < inactive_threshold
                    )
                )
            )

            result = await self.session.execute(inactive_query)
            inactive_user_ids = [row[0] for row in result.fetchall()]

            if not dry_run and inactive_user_ids:
                # Actually delete the users
                deleted_count = await self.bulk_delete(inactive_user_ids)
                logger.info(f"Deleted {deleted_count} inactive users")

            return inactive_user_ids

        except Exception as e:
            logger.error(f"Error cleaning up inactive users: {str(e)}")
            raise RepositoryError(f"Failed to cleanup inactive users: {str(e)}")