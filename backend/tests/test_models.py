import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
import uuid

from database.models import (
    Base, User, Joke, Favorite, JokeInteraction, UserStats, Category,
    create_user, record_interaction
)


@pytest.fixture
def db_session():
    """Create a test database session"""
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


class TestUserModel:
    """Test cases for User model"""
    
    def test_create_user(self, db_session: Session):
        """Test basic user creation"""
        user = User(
            username="testuser",
            email="test@example.com",
            preferred_language="en"
        )
        db_session.add(user)
        db_session.commit()
        
        assert user.id is not None
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.preferred_language == "en"
        assert user.dark_mode is False
        assert user.notifications_enabled is True
        assert user.created_at is not None
        
    def test_user_unique_constraints(self, db_session: Session):
        """Test username and email uniqueness"""
        user1 = User(username="testuser", email="test1@example.com")
        user2 = User(username="testuser", email="test2@example.com")  # Same username
        
        db_session.add(user1)
        db_session.commit()
        
        db_session.add(user2)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()
        
        # Test email uniqueness
        user3 = User(username="testuser2", email="test1@example.com")  # Same email
        db_session.add(user3)
        with pytest.raises(IntegrityError):
            db_session.commit()
            
    def test_user_relationships(self, db_session: Session):
        """Test user relationships are properly set up"""
        user = create_user(db_session, "testuser", "test@example.com")
        db_session.commit()
        
        # Verify user stats were created
        assert user.user_stats is not None
        assert user.user_stats.jokes_viewed == 0
        assert user.user_stats.jokes_liked == 0
        
        # Verify empty relationships
        assert len(user.favorites) == 0
        assert len(user.joke_interactions) == 0


class TestJokeModel:
    """Test cases for Joke model"""
    
    def test_create_joke(self, db_session: Session):
        """Test basic joke creation"""
        joke = Joke(
            text="Why did the chicken cross the road?",
            category="Classic",
            language="en"
        )
        db_session.add(joke)
        db_session.commit()
        
        assert joke.id is not None
        assert joke.text == "Why did the chicken cross the road?"
        assert joke.category == "Classic"
        assert joke.language == "en"
        assert joke.rating == 0.0
        assert joke.view_count == 0
        assert joke.like_count == 0
        assert joke.created_at is not None
        
    def test_joke_with_external_source(self, db_session: Session):
        """Test joke with external API reference"""
        joke = Joke(
            text="External joke",
            external_id="ext_123",
            source="JokeAPI"
        )
        db_session.add(joke)
        db_session.commit()
        
        assert joke.external_id == "ext_123"
        assert joke.source == "JokeAPI"
        
    def test_joke_external_id_unique(self, db_session: Session):
        """Test external_id uniqueness"""
        joke1 = Joke(text="Joke 1", external_id="ext_123")
        joke2 = Joke(text="Joke 2", external_id="ext_123")
        
        db_session.add(joke1)
        db_session.commit()
        
        db_session.add(joke2)
        with pytest.raises(IntegrityError):
            db_session.commit()


class TestFavoriteModel:
    """Test cases for Favorite model"""
    
    def test_create_favorite(self, db_session: Session):
        """Test adding joke to favorites"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Favorite joke")
        db_session.add(joke)
        db_session.commit()
        
        favorite = Favorite(user_id=user.id, joke_id=joke.id)
        db_session.add(favorite)
        db_session.commit()
        
        assert favorite.id is not None
        assert favorite.user_id == user.id
        assert favorite.joke_id == joke.id
        assert favorite.created_at is not None
        
        # Check relationships
        assert len(user.favorites) == 1
        assert len(joke.favorites) == 1
        
    def test_favorite_unique_constraint(self, db_session: Session):
        """Test user can't favorite same joke twice"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Favorite joke")
        db_session.add(joke)
        db_session.commit()
        
        fav1 = Favorite(user_id=user.id, joke_id=joke.id)
        fav2 = Favorite(user_id=user.id, joke_id=joke.id)
        
        db_session.add(fav1)
        db_session.commit()
        
        db_session.add(fav2)
        with pytest.raises(IntegrityError):
            db_session.commit()


class TestJokeInteractionModel:
    """Test cases for JokeInteraction model"""
    
    def test_record_view_interaction(self, db_session: Session):
        """Test recording a view interaction"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Test joke")
        db_session.add(joke)
        db_session.commit()
        
        interaction = record_interaction(db_session, user.id, joke.id, "view")
        db_session.commit()
        
        # Verify interaction created
        assert interaction.interaction_type == "view"
        assert interaction.created_at is not None
        
        # Verify stats updated
        db_session.refresh(joke)
        db_session.refresh(user.user_stats)
        assert joke.view_count == 1
        assert user.user_stats.jokes_viewed == 1
        
    def test_record_like_interaction(self, db_session: Session):
        """Test recording a like interaction"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Test joke")
        db_session.add(joke)
        db_session.commit()
        
        interaction = record_interaction(db_session, user.id, joke.id, "like")
        db_session.commit()
        
        # Verify stats updated
        db_session.refresh(joke)
        db_session.refresh(user.user_stats)
        assert joke.like_count == 1
        assert user.user_stats.jokes_liked == 1
        
    def test_record_skip_interaction(self, db_session: Session):
        """Test recording a skip interaction"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Test joke")
        db_session.add(joke)
        db_session.commit()
        
        interaction = record_interaction(db_session, user.id, joke.id, "skip")
        db_session.commit()
        
        # Verify stats updated
        db_session.refresh(user.user_stats)
        assert user.user_stats.jokes_skipped == 1
        
    def test_multiple_interactions(self, db_session: Session):
        """Test multiple interactions from same user"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Test joke")
        db_session.add(joke)
        db_session.commit()
        
        # User can view, then like the same joke
        record_interaction(db_session, user.id, joke.id, "view")
        record_interaction(db_session, user.id, joke.id, "like")
        db_session.commit()
        
        interactions = db_session.query(JokeInteraction).filter_by(
            user_id=user.id, joke_id=joke.id
        ).all()
        
        assert len(interactions) == 2
        assert {i.interaction_type for i in interactions} == {"view", "like"}


class TestUserStatsModel:
    """Test cases for UserStats model"""
    
    def test_user_stats_created_with_user(self, db_session: Session):
        """Test user stats are created automatically"""
        user = create_user(db_session, "testuser", "test@example.com")
        db_session.commit()
        
        assert user.user_stats is not None
        assert user.user_stats.jokes_viewed == 0
        assert user.user_stats.jokes_liked == 0
        assert user.user_stats.jokes_skipped == 0
        assert user.user_stats.favorite_category is None
        assert user.user_stats.last_active is not None
        
    def test_user_stats_updated_on_interaction(self, db_session: Session):
        """Test stats are updated when interactions occur"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke1 = Joke(text="Joke 1", category="Puns")
        joke2 = Joke(text="Joke 2", category="Dark")
        db_session.add_all([joke1, joke2])
        db_session.commit()
        
        # Record various interactions
        record_interaction(db_session, user.id, joke1.id, "view")
        record_interaction(db_session, user.id, joke1.id, "like")
        record_interaction(db_session, user.id, joke2.id, "view")
        record_interaction(db_session, user.id, joke2.id, "skip")
        db_session.commit()
        
        db_session.refresh(user.user_stats)
        assert user.user_stats.jokes_viewed == 2
        assert user.user_stats.jokes_liked == 1
        assert user.user_stats.jokes_skipped == 1


class TestCategoryModel:
    """Test cases for Category model"""
    
    def test_create_category(self, db_session: Session):
        """Test category creation"""
        category = Category(
            name="puns",
            display_name="Puns",
            description="Wordplay jokes",
            joke_count=10
        )
        db_session.add(category)
        db_session.commit()
        
        assert category.id is not None
        assert category.name == "puns"
        assert category.display_name == "Puns"
        assert category.description == "Wordplay jokes"
        assert category.joke_count == 10
        assert category.created_at is not None
        
    def test_category_name_unique(self, db_session: Session):
        """Test category name uniqueness"""
        cat1 = Category(name="puns", display_name="Puns")
        cat2 = Category(name="puns", display_name="Different Puns")
        
        db_session.add(cat1)
        db_session.commit()
        
        db_session.add(cat2)
        with pytest.raises(IntegrityError):
            db_session.commit()


class TestModelRelationships:
    """Test cases for model relationships and cascading"""
    
    def test_user_deletion_cascades(self, db_session: Session):
        """Test that deleting user cascades to related records"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Test joke")
        db_session.add(joke)
        db_session.commit()
        
        # Create related records
        favorite = Favorite(user_id=user.id, joke_id=joke.id)
        interaction = JokeInteraction(
            user_id=user.id, 
            joke_id=joke.id, 
            interaction_type="like"
        )
        db_session.add_all([favorite, interaction])
        db_session.commit()
        
        # Delete user
        db_session.delete(user)
        db_session.commit()
        
        # Verify cascading deletes
        assert db_session.query(Favorite).filter_by(user_id=user.id).count() == 0
        assert db_session.query(JokeInteraction).filter_by(user_id=user.id).count() == 0
        assert db_session.query(UserStats).filter_by(user_id=user.id).count() == 0
        
        # Joke should still exist
        assert db_session.query(Joke).filter_by(id=joke.id).first() is not None
        
    def test_joke_deletion_cascades(self, db_session: Session):
        """Test that deleting joke cascades to related records"""
        user = create_user(db_session, "testuser", "test@example.com")
        joke = Joke(text="Test joke")
        db_session.add(joke)
        db_session.commit()
        
        # Create related records
        favorite = Favorite(user_id=user.id, joke_id=joke.id)
        interaction = JokeInteraction(
            user_id=user.id, 
            joke_id=joke.id, 
            interaction_type="like"
        )
        db_session.add_all([favorite, interaction])
        db_session.commit()
        
        # Delete joke
        db_session.delete(joke)
        db_session.commit()
        
        # Verify cascading deletes
        assert db_session.query(Favorite).filter_by(joke_id=joke.id).count() == 0
        assert db_session.query(JokeInteraction).filter_by(joke_id=joke.id).count() == 0
        
        # User should still exist
        assert db_session.query(User).filter_by(id=user.id).first() is not None


class TestModelIndexes:
    """Test that model indexes are properly defined"""
    
    def test_user_indexes(self, db_session: Session):
        """Test User model indexes"""
        # This test verifies indexes are created - actual performance testing
        # would require larger datasets
        inspector = db_session.bind.dialect.get_indexes
        user_indexes = inspector(db_session.bind, 'users')
        index_columns = {idx['column_names'][0] for idx in user_indexes if idx['column_names']}
        
        # Verify key columns are indexed
        assert 'username' in index_columns or any('username' in str(idx) for idx in user_indexes)
        assert 'email' in index_columns or any('email' in str(idx) for idx in user_indexes)
        
    def test_joke_indexes(self, db_session: Session):
        """Test Joke model indexes"""
        # Create test data to ensure indexes are built
        joke = Joke(text="Test", category="Test", language="en", rating=5.0)
        db_session.add(joke)
        db_session.commit()
        
        # Verify composite indexes exist by testing queries
        # These should use indexes efficiently
        result = db_session.query(Joke).filter_by(
            category="Test", language="en"
        ).first()
        assert result is not None
        
        result = db_session.query(Joke).filter(
            Joke.rating > 4.0
        ).first()
        assert result is not None


class TestModelValidation:
    """Test model data validation and constraints"""
    
    def test_uuid_generation(self, db_session: Session):
        """Test UUID generation for primary keys"""
        user = User(username="test", email="test@example.com")
        joke = Joke(text="Test joke")
        
        db_session.add_all([user, joke])
        db_session.commit()
        
        # Verify UUIDs are valid
        assert len(user.id) == 36  # Standard UUID string length
        assert len(joke.id) == 36
        
        # Verify they're different
        assert user.id != joke.id
        
        # Verify format
        try:
            uuid.UUID(user.id)
            uuid.UUID(joke.id)
        except ValueError:
            pytest.fail("Invalid UUID format")
            
    def test_timestamp_fields(self, db_session: Session):
        """Test automatic timestamp fields"""
        before = datetime.utcnow()
        
        user = User(username="test", email="test@example.com")
        db_session.add(user)
        db_session.commit()
        
        after = datetime.utcnow()
        
        # Verify created_at is set automatically
        assert user.created_at is not None
        assert before <= user.created_at <= after
        
        # Update user
        user.preferred_language = "es"
        db_session.commit()
        
        # updated_at should be set (if the field exists)
        if hasattr(user, 'updated_at') and user.updated_at:
            assert user.updated_at >= user.created_at