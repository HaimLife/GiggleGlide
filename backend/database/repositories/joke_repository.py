"""Joke repository with specialized joke operations."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, text, desc, asc
from sqlalchemy.orm import selectinload, joinedload
from datetime import datetime, timedelta
import random
import logging

from .base import BaseRepository, RepositoryError, NotFoundError
from ..models import Joke, JokeInteraction, Favorite, User, UserStats

logger = logging.getLogger(__name__)


class JokeRepository(BaseRepository[Joke, Dict[str, Any], Dict[str, Any]]):
    """Repository for joke-specific operations."""

    def __init__(self, session):
        super().__init__(Joke, session)
        self._default_relationships = ['interactions', 'favorites']

    async def get_specialized_query(self, **kwargs):
        """Base implementation for abstract method."""
        return select(self.model)

    # Core Joke Retrieval Methods

    async def get_random_unseen(
        self,
        user_id: str,
        category: Optional[str] = None,
        language: str = 'en',
        exclude_ids: Optional[List[str]] = None,
        min_rating: float = 0.0,
        limit: int = 10
    ) -> List[Joke]:
        """
        Get random unseen jokes for a user.
        
        Args:
            user_id: User ID
            category: Joke category filter
            language: Language preference
            exclude_ids: Joke IDs to exclude
            min_rating: Minimum rating filter
            limit: Maximum number of jokes to return
            
        Returns:
            List of unseen jokes
        """
        try:
            # Subquery to get joke IDs the user has already seen
            seen_subquery = (
                select(JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.interaction_type.in_(['view', 'like', 'skip'])
                    )
                )
            )

            # Main query for unseen jokes
            query = (
                select(Joke)
                .where(
                    and_(
                        Joke.language == language,
                        Joke.rating >= min_rating,
                        Joke.id.notin_(seen_subquery)
                    )
                )
                .options(selectinload(Joke.interactions))
            )

            # Add category filter if specified
            if category:
                query = query.where(Joke.category == category)

            # Add exclusion filter if specified
            if exclude_ids:
                query = query.where(Joke.id.notin_(exclude_ids))

            # Order by rating and randomize
            query = query.order_by(
                desc(Joke.rating),
                func.random()  # PostgreSQL random function
            ).limit(limit * 2)  # Get more than needed for better randomization

            result = await self.session.execute(query)
            jokes = result.scalars().all()

            # Randomize the results and return the requested limit
            random.shuffle(jokes)
            return jokes[:limit]

        except Exception as e:
            logger.error(f"Error getting random unseen jokes for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get random unseen jokes: {str(e)}")

    async def get_by_tags(
        self,
        categories: List[str],
        language: str = 'en',
        user_id: Optional[str] = None,
        exclude_seen: bool = True,
        min_rating: float = 0.0,
        limit: int = 20
    ) -> List[Joke]:
        """
        Get jokes by categories/tags.
        
        Args:
            categories: List of categories to include
            language: Language preference
            user_id: User ID for filtering seen jokes
            exclude_seen: Whether to exclude seen jokes
            min_rating: Minimum rating filter
            limit: Maximum number of jokes to return
            
        Returns:
            List of jokes matching criteria
        """
        try:
            query = (
                select(Joke)
                .where(
                    and_(
                        Joke.category.in_(categories),
                        Joke.language == language,
                        Joke.rating >= min_rating
                    )
                )
                .options(selectinload(Joke.interactions))
            )

            # Exclude seen jokes if requested and user provided
            if exclude_seen and user_id:
                seen_subquery = (
                    select(JokeInteraction.joke_id)
                    .where(
                        and_(
                            JokeInteraction.user_id == user_id,
                            JokeInteraction.interaction_type.in_(['view', 'like', 'skip'])
                        )
                    )
                )
                query = query.where(Joke.id.notin_(seen_subquery))

            # Order by rating and view count
            query = query.order_by(
                desc(Joke.rating),
                desc(Joke.view_count)
            ).limit(limit)

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting jokes by tags {categories}: {str(e)}")
            raise RepositoryError(f"Failed to get jokes by tags: {str(e)}")

    async def mark_as_seen(
        self,
        user_id: str,
        joke_id: str,
        interaction_type: str = 'view'
    ) -> JokeInteraction:
        """
        Mark a joke as seen by a user.
        
        Args:
            user_id: User ID
            joke_id: Joke ID
            interaction_type: Type of interaction ('view', 'like', 'skip')
            
        Returns:
            Created interaction record
        """
        try:
            # Validate interaction type
            valid_types = ['view', 'like', 'skip']
            if interaction_type not in valid_types:
                raise RepositoryError(f"Invalid interaction type: {interaction_type}")

            # Check if interaction already exists
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

            # Create new interaction
            interaction = JokeInteraction(
                user_id=user_id,
                joke_id=joke_id,
                interaction_type=interaction_type
            )
            self.session.add(interaction)

            # Update joke statistics
            await self._update_joke_stats(joke_id, interaction_type)

            # Update user statistics
            await self._update_user_stats(user_id, interaction_type)

            await self.session.flush()
            await self.session.refresh(interaction)

            logger.debug(f"Marked joke {joke_id} as {interaction_type} for user {user_id}")
            return interaction

        except Exception as e:
            logger.error(f"Error marking joke as seen: {str(e)}")
            raise RepositoryError(f"Failed to mark joke as seen: {str(e)}")

    # Advanced Query Methods

    async def get_trending_jokes(
        self,
        language: str = 'en',
        time_window_hours: int = 24,
        limit: int = 10
    ) -> List[Joke]:
        """
        Get trending jokes based on recent interactions.
        
        Args:
            language: Language preference
            time_window_hours: Time window for trending calculation
            limit: Maximum number of jokes to return
            
        Returns:
            List of trending jokes
        """
        try:
            # Calculate the time threshold
            time_threshold = datetime.utcnow() - timedelta(hours=time_window_hours)

            # Subquery to get recent interaction counts
            recent_interactions = (
                select(
                    JokeInteraction.joke_id,
                    func.count(JokeInteraction.id).label('recent_count')
                )
                .where(JokeInteraction.created_at >= time_threshold)
                .group_by(JokeInteraction.joke_id)
                .subquery()
            )

            # Main query to get trending jokes
            query = (
                select(Joke)
                .join(recent_interactions, Joke.id == recent_interactions.c.joke_id)
                .where(Joke.language == language)
                .order_by(desc(recent_interactions.c.recent_count))
                .limit(limit)
                .options(selectinload(Joke.interactions))
            )

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting trending jokes: {str(e)}")
            raise RepositoryError(f"Failed to get trending jokes: {str(e)}")

    async def get_user_favorites(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20
    ) -> List[Joke]:
        """
        Get user's favorite jokes.
        
        Args:
            user_id: User ID
            skip: Number of records to skip
            limit: Maximum number of jokes to return
            
        Returns:
            List of favorite jokes
        """
        try:
            query = (
                select(Joke)
                .join(Favorite, Joke.id == Favorite.joke_id)
                .where(Favorite.user_id == user_id)
                .order_by(desc(Favorite.created_at))
                .offset(skip)
                .limit(limit)
                .options(selectinload(Joke.interactions))
            )

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting user favorites for {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get user favorites: {str(e)}")

    async def get_recommended_jokes(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Joke]:
        """
        Get recommended jokes based on user preferences and behavior.
        
        Args:
            user_id: User ID
            limit: Maximum number of jokes to return
            
        Returns:
            List of recommended jokes
        """
        try:
            # Get user's preferred categories based on likes and favorites
            user_categories_query = (
                select(
                    Joke.category,
                    func.count(Joke.category).label('preference_score')
                )
                .join(JokeInteraction, Joke.id == JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.interaction_type == 'like',
                        Joke.category.isnot(None)
                    )
                )
                .group_by(Joke.category)
                .order_by(desc(func.count(Joke.category)))
                .limit(3)
            )

            result = await self.session.execute(user_categories_query)
            preferred_categories = [row[0] for row in result.fetchall()]

            if not preferred_categories:
                # If no preferences found, return random unseen jokes
                return await self.get_random_unseen(user_id, limit=limit)

            # Get jokes from preferred categories that user hasn't seen
            seen_subquery = (
                select(JokeInteraction.joke_id)
                .where(
                    and_(
                        JokeInteraction.user_id == user_id,
                        JokeInteraction.interaction_type.in_(['view', 'like', 'skip'])
                    )
                )
            )

            query = (
                select(Joke)
                .where(
                    and_(
                        Joke.category.in_(preferred_categories),
                        Joke.id.notin_(seen_subquery),
                        Joke.rating >= 3.0  # Only recommend well-rated jokes
                    )
                )
                .order_by(desc(Joke.rating), func.random())
                .limit(limit)
                .options(selectinload(Joke.interactions))
            )

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting recommended jokes for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get recommended jokes: {str(e)}")

    async def search_jokes(
        self,
        query_text: str,
        language: str = 'en',
        category: Optional[str] = None,
        min_rating: float = 0.0,
        limit: int = 20
    ) -> List[Joke]:
        """
        Search jokes by text content.
        
        Args:
            query_text: Search text
            language: Language preference
            category: Category filter
            min_rating: Minimum rating filter
            limit: Maximum number of jokes to return
            
        Returns:
            List of matching jokes
        """
        try:
            # Use PostgreSQL full-text search or simple ILIKE for compatibility
            query = (
                select(Joke)
                .where(
                    and_(
                        Joke.text.ilike(f"%{query_text}%"),
                        Joke.language == language,
                        Joke.rating >= min_rating
                    )
                )
                .options(selectinload(Joke.interactions))
            )

            if category:
                query = query.where(Joke.category == category)

            query = query.order_by(desc(Joke.rating)).limit(limit)

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error searching jokes with query '{query_text}': {str(e)}")
            raise RepositoryError(f"Failed to search jokes: {str(e)}")

    # Statistics and Analytics

    async def get_joke_stats(self, joke_id: str) -> Dict[str, Any]:
        """
        Get detailed statistics for a joke.
        
        Args:
            joke_id: Joke ID
            
        Returns:
            Dictionary with joke statistics
        """
        try:
            # Get basic joke info
            joke = await self.get(joke_id)
            if not joke:
                raise NotFoundError(f"Joke with id {joke_id} not found")

            # Get interaction statistics
            stats_query = (
                select(
                    JokeInteraction.interaction_type,
                    func.count(JokeInteraction.id).label('count')
                )
                .where(JokeInteraction.joke_id == joke_id)
                .group_by(JokeInteraction.interaction_type)
            )

            result = await self.session.execute(stats_query)
            interaction_stats = {row[0]: row[1] for row in result.fetchall()}

            # Get favorite count
            favorites_query = (
                select(func.count(Favorite.id))
                .where(Favorite.joke_id == joke_id)
            )
            result = await self.session.execute(favorites_query)
            favorite_count = result.scalar() or 0

            return {
                'joke_id': joke_id,
                'text_length': len(joke.text),
                'category': joke.category,
                'language': joke.language,
                'rating': joke.rating,
                'view_count': joke.view_count,
                'like_count': joke.like_count,
                'interactions': interaction_stats,
                'favorite_count': favorite_count,
                'created_at': joke.created_at
            }

        except Exception as e:
            logger.error(f"Error getting joke stats for {joke_id}: {str(e)}")
            raise RepositoryError(f"Failed to get joke stats: {str(e)}")

    async def get_category_stats(self, language: str = 'en') -> List[Dict[str, Any]]:
        """
        Get statistics for all categories.
        
        Args:
            language: Language filter
            
        Returns:
            List of category statistics
        """
        try:
            query = (
                select(
                    Joke.category,
                    func.count(Joke.id).label('joke_count'),
                    func.avg(Joke.rating).label('avg_rating'),
                    func.sum(Joke.view_count).label('total_views'),
                    func.sum(Joke.like_count).label('total_likes')
                )
                .where(
                    and_(
                        Joke.language == language,
                        Joke.category.isnot(None)
                    )
                )
                .group_by(Joke.category)
                .order_by(desc(func.count(Joke.id)))
            )

            result = await self.session.execute(query)
            
            stats = []
            for row in result.fetchall():
                stats.append({
                    'category': row[0],
                    'joke_count': row[1],
                    'avg_rating': float(row[2]) if row[2] else 0.0,
                    'total_views': row[3] or 0,
                    'total_likes': row[4] or 0,
                    'engagement_rate': (row[4] / max(row[3], 1)) * 100 if row[3] else 0.0
                })

            return stats

        except Exception as e:
            logger.error(f"Error getting category stats: {str(e)}")
            raise RepositoryError(f"Failed to get category stats: {str(e)}")

    # Helper Methods

    async def _update_joke_stats(self, joke_id: str, interaction_type: str):
        """Update joke statistics based on interaction."""
        try:
            joke = await self.get(joke_id, raise_not_found=False)
            if not joke:
                return

            if interaction_type == 'view':
                joke.view_count += 1
            elif interaction_type == 'like':
                joke.like_count += 1

            # Recalculate rating based on like ratio
            if joke.view_count > 0:
                joke.rating = round((joke.like_count / joke.view_count) * 5, 2)

            await self.session.flush()

        except Exception as e:
            logger.error(f"Error updating joke stats: {str(e)}")

    async def _update_user_stats(self, user_id: str, interaction_type: str):
        """Update user statistics based on interaction."""
        try:
            stats_query = select(UserStats).where(UserStats.user_id == user_id)
            result = await self.session.execute(stats_query)
            user_stats = result.scalar_one_or_none()

            if not user_stats:
                # Create user stats if they don't exist
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
            logger.error(f"Error updating user stats: {str(e)}")

    # Bulk Operations

    async def bulk_mark_as_seen(
        self,
        interactions: List[Dict[str, str]]
    ) -> List[JokeInteraction]:
        """
        Bulk mark multiple jokes as seen.
        
        Args:
            interactions: List of interaction dictionaries with user_id, joke_id, interaction_type
            
        Returns:
            List of created interactions
        """
        try:
            created_interactions = []

            for interaction_data in interactions:
                user_id = interaction_data.get('user_id')
                joke_id = interaction_data.get('joke_id')
                interaction_type = interaction_data.get('interaction_type', 'view')

                if not user_id or not joke_id:
                    continue

                interaction = await self.mark_as_seen(
                    user_id=user_id,
                    joke_id=joke_id,
                    interaction_type=interaction_type
                )
                created_interactions.append(interaction)

            await self.session.commit()
            return created_interactions

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error bulk marking jokes as seen: {str(e)}")
            raise RepositoryError(f"Failed to bulk mark jokes as seen: {str(e)}")

    async def update_joke_ratings(self) -> int:
        """
        Recalculate ratings for all jokes based on current statistics.
        
        Returns:
            Number of jokes updated
        """
        try:
            # Get all jokes with their current stats
            query = select(Joke).where(Joke.view_count > 0)
            result = await self.session.execute(query)
            jokes = result.scalars().all()

            updated_count = 0
            for joke in jokes:
                if joke.view_count > 0:
                    new_rating = round((joke.like_count / joke.view_count) * 5, 2)
                    if new_rating != joke.rating:
                        joke.rating = new_rating
                        updated_count += 1

            await self.session.commit()
            logger.info(f"Updated ratings for {updated_count} jokes")
            return updated_count

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error updating joke ratings: {str(e)}")
            raise RepositoryError(f"Failed to update joke ratings: {str(e)}")