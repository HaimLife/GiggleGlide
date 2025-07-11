"""Tag repository for managing joke tags and user tag preferences."""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, text, desc, asc, update
from sqlalchemy.orm import selectinload, joinedload
from datetime import datetime, timedelta
import logging

from .base import BaseRepository, RepositoryError, NotFoundError
from ..models import Tag, JokeTag, UserTagScore, Joke, User, TagStyle, TagFormat, TagTopic, TagTone

logger = logging.getLogger(__name__)


class TagRepository(BaseRepository[Tag, Dict[str, Any], Dict[str, Any]]):
    """Repository for tag-specific operations."""

    def __init__(self, session):
        super().__init__(Tag, session)
        self._default_relationships = ['joke_tags']

    async def get_specialized_query(self, **kwargs):
        """Base implementation for abstract method."""
        return select(self.model)

    # Tag Management Methods

    async def create_tag(
        self,
        name: str,
        category: str,
        value: str,
        description: Optional[str] = None
    ) -> Tag:
        """
        Create a new tag.
        
        Args:
            name: Tag name (human-readable)
            category: Tag category (style, format, topic, tone)
            value: Enum value for the tag
            description: Optional description
            
        Returns:
            Created tag
        """
        try:
            # Check if tag already exists
            existing_query = select(Tag).where(Tag.name == name)
            result = await self.session.execute(existing_query)
            existing = result.scalar_one_or_none()

            if existing:
                logger.info(f"Tag {name} already exists")
                return existing

            tag = Tag(
                name=name,
                category=category,
                value=value,
                description=description
            )
            
            self.session.add(tag)
            await self.session.flush()
            await self.session.refresh(tag)
            
            logger.info(f"Created tag: {name} ({category})")
            return tag

        except Exception as e:
            logger.error(f"Error creating tag {name}: {str(e)}")
            raise RepositoryError(f"Failed to create tag: {str(e)}")

    async def get_tags_by_category(self, category: str) -> List[Tag]:
        """
        Get all tags for a specific category.
        
        Args:
            category: Tag category
            
        Returns:
            List of tags
        """
        try:
            query = (
                select(Tag)
                .where(Tag.category == category)
                .order_by(Tag.name)
            )
            
            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting tags for category {category}: {str(e)}")
            raise RepositoryError(f"Failed to get tags by category: {str(e)}")

    async def get_joke_tags(self, joke_id: str) -> List[Tuple[Tag, float]]:
        """
        Get all tags for a joke with their confidence scores.
        
        Args:
            joke_id: Joke ID
            
        Returns:
            List of (tag, confidence) tuples
        """
        try:
            query = (
                select(Tag, JokeTag.confidence)
                .join(JokeTag, Tag.id == JokeTag.tag_id)
                .where(JokeTag.joke_id == joke_id)
                .order_by(desc(JokeTag.confidence))
            )
            
            result = await self.session.execute(query)
            return [(row[0], row[1]) for row in result.fetchall()]

        except Exception as e:
            logger.error(f"Error getting tags for joke {joke_id}: {str(e)}")
            raise RepositoryError(f"Failed to get joke tags: {str(e)}")

    async def add_joke_tag(
        self,
        joke_id: str,
        tag_id: str,
        confidence: float = 1.0
    ) -> JokeTag:
        """
        Add a tag to a joke.
        
        Args:
            joke_id: Joke ID
            tag_id: Tag ID
            confidence: Confidence score for the tag assignment
            
        Returns:
            Created JokeTag association
        """
        try:
            # Check if association already exists
            existing_query = (
                select(JokeTag)
                .where(
                    and_(
                        JokeTag.joke_id == joke_id,
                        JokeTag.tag_id == tag_id
                    )
                )
            )
            result = await self.session.execute(existing_query)
            existing = result.scalar_one_or_none()

            if existing:
                # Update confidence if different
                if existing.confidence != confidence:
                    existing.confidence = confidence
                    await self.session.flush()
                return existing

            joke_tag = JokeTag(
                joke_id=joke_id,
                tag_id=tag_id,
                confidence=confidence
            )
            
            self.session.add(joke_tag)
            await self.session.flush()
            await self.session.refresh(joke_tag)
            
            logger.debug(f"Added tag {tag_id} to joke {joke_id} with confidence {confidence}")
            return joke_tag

        except Exception as e:
            logger.error(f"Error adding tag to joke: {str(e)}")
            raise RepositoryError(f"Failed to add joke tag: {str(e)}")

    async def remove_joke_tag(self, joke_id: str, tag_id: str) -> bool:
        """
        Remove a tag from a joke.
        
        Args:
            joke_id: Joke ID
            tag_id: Tag ID
            
        Returns:
            True if removed, False if not found
        """
        try:
            query = (
                select(JokeTag)
                .where(
                    and_(
                        JokeTag.joke_id == joke_id,
                        JokeTag.tag_id == tag_id
                    )
                )
            )
            result = await self.session.execute(query)
            joke_tag = result.scalar_one_or_none()

            if joke_tag:
                await self.session.delete(joke_tag)
                await self.session.flush()
                logger.debug(f"Removed tag {tag_id} from joke {joke_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error removing tag from joke: {str(e)}")
            raise RepositoryError(f"Failed to remove joke tag: {str(e)}")

    # User Tag Preference Methods

    async def get_user_tag_scores(self, user_id: str) -> List[UserTagScore]:
        """
        Get all tag scores for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            List of user tag scores
        """
        try:
            query = (
                select(UserTagScore)
                .options(selectinload(UserTagScore.tag))
                .where(UserTagScore.user_id == user_id)
                .order_by(desc(UserTagScore.score))
            )
            
            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting tag scores for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get user tag scores: {str(e)}")

    async def update_user_tag_score(
        self,
        user_id: str,
        tag_id: str,
        score_delta: float,
        interaction_weight: float = 1.0
    ) -> UserTagScore:
        """
        Update user's preference score for a tag.
        
        Args:
            user_id: User ID
            tag_id: Tag ID
            score_delta: Change in score (-1 to 1)
            interaction_weight: Weight of this interaction
            
        Returns:
            Updated UserTagScore
        """
        try:
            # Get existing score or create new one
            query = (
                select(UserTagScore)
                .where(
                    and_(
                        UserTagScore.user_id == user_id,
                        UserTagScore.tag_id == tag_id
                    )
                )
            )
            result = await self.session.execute(query)
            user_tag_score = result.scalar_one_or_none()

            if not user_tag_score:
                user_tag_score = UserTagScore(
                    user_id=user_id,
                    tag_id=tag_id,
                    score=0.0,
                    interaction_count=0
                )
                self.session.add(user_tag_score)

            # Update score using exponential moving average
            alpha = min(0.3, 1.0 / (user_tag_score.interaction_count + 1))  # Learning rate
            new_score = user_tag_score.score + alpha * score_delta * interaction_weight
            
            # Clamp score to [-1, 1]
            user_tag_score.score = max(-1.0, min(1.0, new_score))
            user_tag_score.interaction_count += 1
            user_tag_score.last_updated = datetime.utcnow()

            await self.session.flush()
            await self.session.refresh(user_tag_score)
            
            logger.debug(f"Updated tag score for user {user_id}, tag {tag_id}: {user_tag_score.score}")
            return user_tag_score

        except Exception as e:
            logger.error(f"Error updating user tag score: {str(e)}")
            raise RepositoryError(f"Failed to update user tag score: {str(e)}")

    async def get_user_top_tags(
        self,
        user_id: str,
        category: Optional[str] = None,
        limit: int = 10
    ) -> List[Tuple[Tag, float]]:
        """
        Get user's top-rated tags.
        
        Args:
            user_id: User ID
            category: Optional category filter
            limit: Maximum number of tags to return
            
        Returns:
            List of (tag, score) tuples
        """
        try:
            query = (
                select(Tag, UserTagScore.score)
                .join(UserTagScore, Tag.id == UserTagScore.tag_id)
                .where(
                    and_(
                        UserTagScore.user_id == user_id,
                        UserTagScore.score > 0
                    )
                )
            )

            if category:
                query = query.where(Tag.category == category)

            query = query.order_by(desc(UserTagScore.score)).limit(limit)
            
            result = await self.session.execute(query)
            return [(row[0], row[1]) for row in result.fetchall()]

        except Exception as e:
            logger.error(f"Error getting top tags for user {user_id}: {str(e)}")
            raise RepositoryError(f"Failed to get user top tags: {str(e)}")

    # Tag Analysis Methods

    async def get_tag_popularity(self, limit: int = 20) -> List[Tuple[Tag, int]]:
        """
        Get most popular tags based on joke assignments.
        
        Args:
            limit: Maximum number of tags to return
            
        Returns:
            List of (tag, usage_count) tuples
        """
        try:
            query = (
                select(Tag, func.count(JokeTag.id).label('usage_count'))
                .join(JokeTag, Tag.id == JokeTag.tag_id)
                .group_by(Tag.id)
                .order_by(desc(func.count(JokeTag.id)))
                .limit(limit)
            )
            
            result = await self.session.execute(query)
            return [(row[0], row[1]) for row in result.fetchall()]

        except Exception as e:
            logger.error(f"Error getting tag popularity: {str(e)}")
            raise RepositoryError(f"Failed to get tag popularity: {str(e)}")

    async def get_similar_tags(
        self,
        tag_id: str,
        limit: int = 10
    ) -> List[Tuple[Tag, float]]:
        """
        Get tags that frequently appear together with the given tag.
        
        Args:
            tag_id: Reference tag ID
            limit: Maximum number of similar tags to return
            
        Returns:
            List of (similar_tag, cooccurrence_score) tuples
        """
        try:
            # Find jokes that have the reference tag
            reference_jokes_subquery = (
                select(JokeTag.joke_id)
                .where(JokeTag.tag_id == tag_id)
                .subquery()
            )

            # Find other tags that appear in those jokes
            query = (
                select(
                    Tag,
                    func.count(JokeTag.id).label('cooccurrence_count'),
                    (func.count(JokeTag.id).cast(Float) / 
                     func.count(func.distinct(JokeTag.joke_id)).cast(Float)).label('cooccurrence_score')
                )
                .join(JokeTag, Tag.id == JokeTag.tag_id)
                .where(
                    and_(
                        JokeTag.joke_id.in_(select(reference_jokes_subquery)),
                        Tag.id != tag_id
                    )
                )
                .group_by(Tag.id)
                .order_by(desc(text('cooccurrence_score')))
                .limit(limit)
            )
            
            result = await self.session.execute(query)
            return [(row[0], float(row[2])) for row in result.fetchall()]

        except Exception as e:
            logger.error(f"Error getting similar tags for {tag_id}: {str(e)}")
            raise RepositoryError(f"Failed to get similar tags: {str(e)}")

    # Bulk Operations

    async def bulk_create_tags(self, tag_data: List[Dict[str, Any]]) -> List[Tag]:
        """
        Bulk create tags from tag data.
        
        Args:
            tag_data: List of tag dictionaries
            
        Returns:
            List of created tags
        """
        try:
            created_tags = []
            
            for data in tag_data:
                tag = await self.create_tag(**data)
                created_tags.append(tag)
            
            await self.session.commit()
            logger.info(f"Bulk created {len(created_tags)} tags")
            return created_tags

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error bulk creating tags: {str(e)}")
            raise RepositoryError(f"Failed to bulk create tags: {str(e)}")

    async def initialize_default_tags(self) -> int:
        """
        Initialize the default tag taxonomy.
        
        Returns:
            Number of tags created
        """
        try:
            tags_to_create = []
            
            # Style tags
            for style in TagStyle:
                tags_to_create.append({
                    'name': style.value.replace('_', ' ').title(),
                    'category': 'style',
                    'value': style.value,
                    'description': f'Joke style: {style.value.replace("_", " ")}'
                })
            
            # Format tags
            for format_tag in TagFormat:
                tags_to_create.append({
                    'name': format_tag.value.replace('_', ' ').title(),
                    'category': 'format',
                    'value': format_tag.value,
                    'description': f'Joke format: {format_tag.value.replace("_", " ")}'
                })
            
            # Topic tags
            for topic in TagTopic:
                tags_to_create.append({
                    'name': topic.value.replace('_', ' ').title(),
                    'category': 'topic',
                    'value': topic.value,
                    'description': f'Joke topic: {topic.value.replace("_", " ")}'
                })
            
            # Tone tags
            for tone in TagTone:
                tags_to_create.append({
                    'name': tone.value.replace('_', ' ').title(),
                    'category': 'tone',
                    'value': tone.value,
                    'description': f'Joke tone: {tone.value.replace("_", " ")}'
                })
            
            created_tags = await self.bulk_create_tags(tags_to_create)
            logger.info(f"Initialized {len(created_tags)} default tags")
            return len(created_tags)

        except Exception as e:
            logger.error(f"Error initializing default tags: {str(e)}")
            raise RepositoryError(f"Failed to initialize default tags: {str(e)}")