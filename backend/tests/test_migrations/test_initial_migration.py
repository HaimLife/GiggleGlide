"""Tests for database migrations"""

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool
from alembic import command
from alembic.config import Config
import os
import tempfile
from pathlib import Path


class TestMigrations:
    """Test database migrations"""

    @pytest.fixture
    def temp_db(self):
        """Create a temporary SQLite database for testing"""
        db_fd, db_path = tempfile.mkstemp()
        yield f"sqlite:///{db_path}"
        os.close(db_fd)
        os.unlink(db_path)

    @pytest.fixture
    def alembic_config(self, temp_db):
        """Create Alembic configuration for testing"""
        # Get the backend directory path
        backend_dir = Path(__file__).parent.parent.parent
        alembic_ini_path = backend_dir / "alembic.ini"
        
        config = Config(str(alembic_ini_path))
        config.set_main_option("sqlalchemy.url", temp_db)
        config.set_main_option("script_location", str(backend_dir / "alembic"))
        
        return config

    def test_initial_migration_creates_all_tables(self, alembic_config, temp_db):
        """Test that the initial migration creates all required tables"""
        # Run migrations up to the initial migration
        command.upgrade(alembic_config, "001")
        
        # Create engine and inspector
        engine = create_engine(temp_db, poolclass=NullPool)
        inspector = inspect(engine)
        
        # Check that all tables exist
        tables = inspector.get_table_names()
        expected_tables = [
            'users',
            'categories',
            'jokes',
            'user_stats',
            'favorites',
            'joke_interactions',
            'alembic_version'  # Alembic's internal table
        ]
        
        for table in expected_tables:
            if table != 'alembic_version':
                assert table in tables, f"Table '{table}' not found in database"

    def test_users_table_structure(self, alembic_config, temp_db):
        """Test the structure of the users table"""
        command.upgrade(alembic_config, "001")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        inspector = inspect(engine)
        
        # Check columns
        columns = {col['name']: col for col in inspector.get_columns('users')}
        
        assert 'id' in columns
        assert columns['id']['type'].python_type == str
        assert not columns['id']['nullable']
        
        assert 'username' in columns
        assert 'email' in columns
        assert 'preferred_language' in columns
        assert 'dark_mode' in columns
        assert 'notifications_enabled' in columns
        
        # Check indexes
        indexes = inspector.get_indexes('users')
        index_names = [idx['name'] for idx in indexes]
        assert 'ix_users_username' in index_names
        assert 'ix_users_email' in index_names

    def test_jokes_table_structure(self, alembic_config, temp_db):
        """Test the structure of the jokes table"""
        command.upgrade(alembic_config, "001")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        inspector = inspect(engine)
        
        # Check columns
        columns = {col['name']: col for col in inspector.get_columns('jokes')}
        
        assert 'id' in columns
        assert 'text' in columns
        assert 'category' in columns
        assert 'language' in columns
        assert 'rating' in columns
        assert 'view_count' in columns
        assert 'like_count' in columns
        
        # Check indexes
        indexes = inspector.get_indexes('jokes')
        index_names = [idx['name'] for idx in indexes]
        assert 'idx_joke_category_language' in index_names
        assert 'idx_joke_rating' in index_names

    def test_foreign_key_constraints(self, alembic_config, temp_db):
        """Test that foreign key constraints are properly set up"""
        command.upgrade(alembic_config, "001")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        inspector = inspect(engine)
        
        # Check favorites table foreign keys
        fks = inspector.get_foreign_keys('favorites')
        fk_columns = {fk['constrained_columns'][0]: fk for fk in fks}
        
        assert 'user_id' in fk_columns
        assert fk_columns['user_id']['referred_table'] == 'users'
        
        assert 'joke_id' in fk_columns
        assert fk_columns['joke_id']['referred_table'] == 'jokes'

    def test_seed_data_migration(self, alembic_config, temp_db):
        """Test that seed data migration adds initial data"""
        # Run migrations including seed data
        command.upgrade(alembic_config, "002")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        
        with engine.connect() as conn:
            # Check categories
            result = conn.execute(text("SELECT COUNT(*) FROM categories"))
            count = result.scalar()
            assert count == 5, f"Expected 5 categories, got {count}"
            
            # Check specific category
            result = conn.execute(
                text("SELECT display_name FROM categories WHERE name = :name"),
                {"name": "programming"}
            )
            display_name = result.scalar()
            assert display_name == "Programming"
            
            # Check jokes
            result = conn.execute(text("SELECT COUNT(*) FROM jokes"))
            count = result.scalar()
            assert count == 25, f"Expected 25 jokes, got {count}"
            
            # Check jokes by category
            result = conn.execute(
                text("SELECT COUNT(*) FROM jokes WHERE category = :category"),
                {"category": "programming"}
            )
            prog_jokes = result.scalar()
            assert prog_jokes == 5, f"Expected 5 programming jokes, got {prog_jokes}"

    def test_migration_rollback(self, alembic_config, temp_db):
        """Test that migrations can be rolled back"""
        # Run all migrations
        command.upgrade(alembic_config, "002")
        
        # Rollback seed data
        command.downgrade(alembic_config, "001")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        with engine.connect() as conn:
            # Check that seed data is removed
            result = conn.execute(text("SELECT COUNT(*) FROM jokes WHERE source = 'seed'"))
            count = result.scalar()
            assert count == 0, "Seed jokes should be removed after rollback"
        
        # Rollback initial migration
        command.downgrade(alembic_config, "base")
        
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        # Only alembic_version table should remain
        assert len(tables) == 1
        assert tables[0] == 'alembic_version'

    def test_check_constraints(self, alembic_config, temp_db):
        """Test that check constraints are working"""
        command.upgrade(alembic_config, "001")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        
        with engine.connect() as conn:
            # Test rating constraint (should be between 0 and 5)
            with pytest.raises(Exception):  # SQLite will raise IntegrityError
                conn.execute(
                    text("""
                        INSERT INTO jokes (id, text, category, rating)
                        VALUES (:id, :text, :category, :rating)
                    """),
                    {
                        "id": "test-id",
                        "text": "Test joke",
                        "category": "test",
                        "rating": 6.0  # Invalid rating
                    }
                )
                conn.commit()

    def test_unique_constraints(self, alembic_config, temp_db):
        """Test that unique constraints are enforced"""
        command.upgrade(alembic_config, "001")
        
        engine = create_engine(temp_db, poolclass=NullPool)
        
        with engine.connect() as conn:
            # Insert a user
            conn.execute(
                text("""
                    INSERT INTO users (id, username, email)
                    VALUES (:id, :username, :email)
                """),
                {
                    "id": "test-user-1",
                    "username": "testuser",
                    "email": "test@example.com"
                }
            )
            conn.commit()
            
            # Try to insert another user with same username
            with pytest.raises(Exception):  # SQLite will raise IntegrityError
                conn.execute(
                    text("""
                        INSERT INTO users (id, username, email)
                        VALUES (:id, :username, :email)
                    """),
                    {
                        "id": "test-user-2",
                        "username": "testuser",  # Duplicate username
                        "email": "test2@example.com"
                    }
                )
                conn.commit()