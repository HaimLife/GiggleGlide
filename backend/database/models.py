from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional, List
import uuid

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
    
    # Relationships
    favorites = relationship('Favorite', back_populates='user', cascade='all, delete-orphan')
    joke_interactions = relationship('JokeInteraction', back_populates='user', cascade='all, delete-orphan')
    user_stats = relationship('UserStats', back_populates='user', uselist=False, cascade='all, delete-orphan')

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

    __table_args__ = (
        Index('idx_joke_category_language', 'category', 'language'),
        Index('idx_joke_rating', 'rating'),
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

    __table_args__ = (
        Index('idx_interaction_user_joke_type', 'user_id', 'joke_id', 'interaction_type'),
        Index('idx_interaction_created', 'created_at'),
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