from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, Index, CheckConstraint, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional, List
import uuid
import re

Base = declarative_base()


class User(Base):
    """User model for storing user information"""
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # User preferences
    preferred_language = Column(String(5), default='en')
    dark_mode = Column(Boolean, default=False)
    notifications_enabled = Column(Boolean, default=True)
    notification_time = Column(String(5), default='09:00')  # HH:MM format
    
    # Relationships
    favorites = relationship('Favorite', back_populates='user', cascade='all, delete-orphan')
    joke_interactions = relationship('JokeInteraction', back_populates='user', cascade='all, delete-orphan')
    user_stats = relationship('UserStats', back_populates='user', uselist=False, cascade='all, delete-orphan')

    @validates('email')
    def validate_email(self, key, email):
        """Validate email format"""
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            raise ValueError('Invalid email format')
        return email.lower()
    
    @validates('username')
    def validate_username(self, key, username):
        """Validate username format"""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', username):
            raise ValueError('Username must be 3-50 characters and contain only letters, numbers, and underscores')
        return username
    
    @validates('preferred_language')
    def validate_language(self, key, language):
        """Validate language code"""
        valid_languages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh']
        if language not in valid_languages:
            raise ValueError(f'Invalid language code. Must be one of: {valid_languages}')
        return language

    def __repr__(self):
        return f"<User(id={self.id}, username={self.username})>"


class Joke(Base):
    """Joke model for storing jokes"""
    __tablename__ = 'jokes'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    text = Column(Text, nullable=False)
    category = Column(String(50), nullable=True, index=True)
    language = Column(String(5), default='en', index=True)
    rating = Column(Float, default=0.0)
    view_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # External API reference (if joke comes from external source)
    external_id = Column(String(100), nullable=True, unique=True)
    source = Column(String(50), nullable=True)
    
    # Relationships
    favorites = relationship('Favorite', back_populates='joke', cascade='all, delete-orphan')
    interactions = relationship('JokeInteraction', back_populates='joke', cascade='all, delete-orphan')

    @validates('rating')
    def validate_rating(self, key, rating):
        """Validate rating is within bounds"""
        if rating < 0 or rating > 5:
            raise ValueError('Rating must be between 0 and 5')
        return rating
    
    @validates('language')
    def validate_language(self, key, language):
        """Validate language code"""
        valid_languages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh']
        if language not in valid_languages:
            raise ValueError(f'Invalid language code. Must be one of: {valid_languages}')
        return language

    __table_args__ = (
        Index('idx_joke_category_language', 'category', 'language'),
        Index('idx_joke_rating', 'rating'),
        Index('idx_joke_created', 'created_at'),
        CheckConstraint('rating >= 0 AND rating <= 5', name='check_rating_bounds'),
        CheckConstraint('view_count >= 0', name='check_view_count_positive'),
        CheckConstraint('like_count >= 0', name='check_like_count_positive'),
    )

    def __repr__(self):
        return f"<Joke(id={self.id}, category={self.category})>"


class Favorite(Base):
    """Favorite model for storing user's favorite jokes"""
    __tablename__ = 'favorites'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    joke_id = Column(String(36), ForeignKey('jokes.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship('User', back_populates='favorites')
    joke = relationship('Joke', back_populates='favorites')

    __table_args__ = (
        Index('idx_favorite_user_joke', 'user_id', 'joke_id', unique=True),
    )

    def __repr__(self):
        return f"<Favorite(user_id={self.user_id}, joke_id={self.joke_id})>"


class JokeInteraction(Base):
    """Track user interactions with jokes (views, likes, skips)"""
    __tablename__ = 'joke_interactions'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    joke_id = Column(String(36), ForeignKey('jokes.id'), nullable=False)
    interaction_type = Column(String(20), nullable=False)  # 'view', 'like', 'skip'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship('User', back_populates='joke_interactions')
    joke = relationship('Joke', back_populates='interactions')

    @validates('interaction_type')
    def validate_interaction_type(self, key, interaction_type):
        """Validate interaction type"""
        valid_types = ['view', 'like', 'skip']
        if interaction_type not in valid_types:
            raise ValueError(f'Invalid interaction type. Must be one of: {valid_types}')
        return interaction_type

    __table_args__ = (
        Index('idx_interaction_user_joke_type', 'user_id', 'joke_id', 'interaction_type'),
        Index('idx_interaction_created', 'created_at'),
        Index('idx_interaction_user_created', 'user_id', 'created_at'),
        CheckConstraint("interaction_type IN ('view', 'like', 'skip')", name='check_interaction_type'),
    )

    def __repr__(self):
        return f"<JokeInteraction(user_id={self.user_id}, joke_id={self.joke_id}, type={self.interaction_type})>"


class UserStats(Base):
    """Aggregated statistics for each user"""
    __tablename__ = 'user_stats'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('users.id'), unique=True, nullable=False)
    jokes_viewed = Column(Integer, default=0)
    jokes_liked = Column(Integer, default=0)
    jokes_skipped = Column(Integer, default=0)
    favorite_category = Column(String(50), nullable=True)
    last_active = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship('User', back_populates='user_stats')

    __table_args__ = (
        CheckConstraint('jokes_viewed >= 0', name='check_jokes_viewed_positive'),
        CheckConstraint('jokes_liked >= 0', name='check_jokes_liked_positive'),
        CheckConstraint('jokes_skipped >= 0', name='check_jokes_skipped_positive'),
    )

    def __repr__(self):
        return f"<UserStats(user_id={self.user_id}, viewed={self.jokes_viewed}, liked={self.jokes_liked})>"


class Category(Base):
    """Category model for joke categories"""
    __tablename__ = 'categories'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    joke_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @validates('name')
    def validate_name(self, key, name):
        """Validate category name format"""
        if not re.match(r'^[a-z0-9_]{2,50}$', name):
            raise ValueError('Category name must be 2-50 lowercase characters, numbers, and underscores')
        return name

    __table_args__ = (
        CheckConstraint('joke_count >= 0', name='check_joke_count_positive'),
    )

    def __repr__(self):
        return f"<Category(name={self.name}, count={self.joke_count})>"


# Helper functions for model operations
def create_user(session, username: str, email: str, preferred_language: str = 'en') -> User:
    """Create a new user with associated stats"""
    user = User(
        username=username,
        email=email,
        preferred_language=preferred_language
    )
    session.add(user)
    session.flush()
    
    # Create associated user stats
    user_stats = UserStats(user_id=user.id)
    session.add(user_stats)
    
    return user


def record_interaction(session, user_id: str, joke_id: str, interaction_type: str) -> JokeInteraction:
    """Record a user interaction with a joke"""
    # Validate interaction type
    valid_types = ['view', 'like', 'skip']
    if interaction_type not in valid_types:
        raise ValueError(f'Invalid interaction type. Must be one of: {valid_types}')
    
    interaction = JokeInteraction(
        user_id=user_id,
        joke_id=joke_id,
        interaction_type=interaction_type
    )
    session.add(interaction)
    
    # Update joke stats
    joke = session.query(Joke).filter_by(id=joke_id).first()
    if joke:
        if interaction_type == 'view':
            joke.view_count += 1
        elif interaction_type == 'like':
            joke.like_count += 1
            # Update rating based on like ratio
            if joke.view_count > 0:
                joke.rating = round((joke.like_count / joke.view_count) * 5, 2)
    
    # Update user stats
    user_stats = session.query(UserStats).filter_by(user_id=user_id).first()
    if user_stats:
        if interaction_type == 'view':
            user_stats.jokes_viewed += 1
        elif interaction_type == 'like':
            user_stats.jokes_liked += 1
        elif interaction_type == 'skip':
            user_stats.jokes_skipped += 1
        user_stats.last_active = datetime.utcnow()
    
    return interaction


def add_joke_to_favorites(session, user_id: str, joke_id: str) -> Optional[Favorite]:
    """Add a joke to user's favorites"""
    # Check if already favorited
    existing = session.query(Favorite).filter_by(
        user_id=user_id, joke_id=joke_id
    ).first()
    
    if existing:
        return None  # Already favorited
    
    favorite = Favorite(user_id=user_id, joke_id=joke_id)
    session.add(favorite)
    return favorite


def remove_joke_from_favorites(session, user_id: str, joke_id: str) -> bool:
    """Remove a joke from user's favorites"""
    favorite = session.query(Favorite).filter_by(
        user_id=user_id, joke_id=joke_id
    ).first()
    
    if favorite:
        session.delete(favorite)
        return True
    return False


def get_user_favorite_categories(session, user_id: str, limit: int = 3) -> List[tuple]:
    """Get user's most favorited joke categories"""
    result = session.query(
        Joke.category, func.count(Joke.category).label('count')
    ).join(
        Favorite, Favorite.joke_id == Joke.id
    ).filter(
        Favorite.user_id == user_id,
        Joke.category.isnot(None)
    ).group_by(
        Joke.category
    ).order_by(
        func.count(Joke.category).desc()
    ).limit(limit).all()
    
    return result