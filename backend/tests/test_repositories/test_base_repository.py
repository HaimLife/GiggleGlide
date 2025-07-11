"""Tests for base repository functionality."""

import pytest
from datetime import datetime, timedelta
from sqlalchemy import select

from database.repositories.base import BaseRepository, RepositoryError, NotFoundError, ValidationError
from database.models import User, UserStats


class TestBaseRepository:
    """Test suite for BaseRepository."""
    
    @pytest.mark.asyncio
    async def test_create_entity(self, user_repository, sample_user_data):
        """Test creating a new entity."""
        user = await user_repository.create(sample_user_data)
        
        assert user.id is not None
        assert user.username == sample_user_data['username']
        assert user.email == sample_user_data['email']
        assert user.preferred_language == sample_user_data['preferred_language']
        assert user.created_at is not None
    
    @pytest.mark.asyncio
    async def test_create_with_commit_false(self, user_repository, sample_user_data):
        """Test creating entity without committing."""
        user = await user_repository.create(sample_user_data, commit=False)
        
        assert user.id is not None
        # Should be able to access the user within the same session
        fetched_user = await user_repository.get(user.id)
        assert fetched_user is not None
    
    @pytest.mark.asyncio
    async def test_get_entity_by_id(self, user_repository, created_user):
        """Test retrieving entity by ID."""
        user = await user_repository.get(created_user.id)
        
        assert user is not None
        assert user.id == created_user.id
        assert user.username == created_user.username
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_entity_raises_error(self, user_repository):
        """Test that getting non-existent entity raises NotFoundError."""
        with pytest.raises(NotFoundError):
            await user_repository.get("nonexistent-id", raise_not_found=True)
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_entity_returns_none(self, user_repository):
        """Test that getting non-existent entity returns None when raise_not_found=False."""
        user = await user_repository.get("nonexistent-id", raise_not_found=False)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_update_entity(self, user_repository, created_user):
        """Test updating an entity."""
        update_data = {
            'preferred_language': 'es',
            'dark_mode': True
        }
        
        updated_user = await user_repository.update(created_user.id, update_data)
        
        assert updated_user.preferred_language == 'es'
        assert updated_user.dark_mode is True
        assert updated_user.updated_at is not None
    
    @pytest.mark.asyncio
    async def test_update_nonexistent_entity_raises_error(self, user_repository):
        """Test that updating non-existent entity raises NotFoundError."""
        with pytest.raises(NotFoundError):
            await user_repository.update("nonexistent-id", {'username': 'new_name'})
    
    @pytest.mark.asyncio
    async def test_delete_entity(self, user_repository, created_user):
        """Test deleting an entity."""
        result = await user_repository.delete(created_user.id)
        
        assert result is True
        
        # Verify entity is deleted
        user = await user_repository.get(created_user.id, raise_not_found=False)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_delete_nonexistent_entity(self, user_repository):
        """Test deleting non-existent entity returns False."""
        result = await user_repository.delete("nonexistent-id")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_get_multi_with_pagination(self, user_repository, multiple_users):
        """Test retrieving multiple entities with pagination."""
        # Get first 3 users
        users_page1 = await user_repository.get_multi(skip=0, limit=3)
        assert len(users_page1) == 3
        
        # Get next 2 users
        users_page2 = await user_repository.get_multi(skip=3, limit=3)
        assert len(users_page2) == 2
        
        # Verify no overlap
        page1_ids = {user.id for user in users_page1}
        page2_ids = {user.id for user in users_page2}
        assert page1_ids.isdisjoint(page2_ids)
    
    @pytest.mark.asyncio
    async def test_get_multi_with_filters(self, user_repository, multiple_users):
        """Test retrieving multiple entities with filters."""
        # Update one user's language
        test_user = multiple_users[0]
        await user_repository.update(test_user.id, {'preferred_language': 'es'})
        
        # Filter by language
        spanish_users = await user_repository.get_multi(
            filters={'preferred_language': 'es'}
        )
        
        assert len(spanish_users) == 1
        assert spanish_users[0].id == test_user.id
    
    @pytest.mark.asyncio
    async def test_get_multi_with_ordering(self, user_repository, multiple_users):
        """Test retrieving multiple entities with ordering."""
        # Get users ordered by username descending
        users_desc = await user_repository.get_multi(
            order_by='username',
            order_desc=True
        )
        
        usernames = [user.username for user in users_desc]
        assert usernames == sorted(usernames, reverse=True)
    
    @pytest.mark.asyncio
    async def test_count_entities(self, user_repository, multiple_users):
        """Test counting entities."""
        total_count = await user_repository.count()
        assert total_count == len(multiple_users)
        
        # Count with filters
        filtered_count = await user_repository.count(
            filters={'preferred_language': 'en'}
        )
        assert filtered_count == len(multiple_users)
    
    @pytest.mark.asyncio
    async def test_exists_entity(self, user_repository, created_user):
        """Test checking if entity exists."""
        exists = await user_repository.exists(created_user.id)
        assert exists is True
        
        not_exists = await user_repository.exists("nonexistent-id")
        assert not_exists is False
    
    @pytest.mark.asyncio
    async def test_find_by_field(self, user_repository, created_user):
        """Test finding entities by field values."""
        users = await user_repository.find_by(username=created_user.username)
        
        assert len(users) == 1
        assert users[0].id == created_user.id
    
    @pytest.mark.asyncio
    async def test_find_one_by_field(self, user_repository, created_user):
        """Test finding one entity by field values."""
        user = await user_repository.find_one_by(username=created_user.username)
        
        assert user is not None
        assert user.id == created_user.id
    
    @pytest.mark.asyncio
    async def test_find_one_by_nonexistent_raises_error(self, user_repository):
        """Test that find_one_by raises error when not found and raise_not_found=True."""
        with pytest.raises(NotFoundError):
            await user_repository.find_one_by(
                username="nonexistent",
                raise_not_found=True
            )
    
    @pytest.mark.asyncio
    async def test_bulk_create(self, user_repository):
        """Test bulk creating entities."""
        user_data_list = [
            {
                'username': f'bulkuser{i}',
                'email': f'bulk{i}@example.com',
                'preferred_language': 'en'
            }
            for i in range(5)
        ]
        
        created_users = await user_repository.bulk_create(user_data_list)
        
        assert len(created_users) == 5
        for i, user in enumerate(created_users):
            assert user.username == f'bulkuser{i}'
            assert user.email == f'bulk{i}@example.com'
    
    @pytest.mark.asyncio
    async def test_bulk_update(self, user_repository, multiple_users):
        """Test bulk updating entities."""
        updates = []
        for i, user in enumerate(multiple_users[:3]):
            updates.append({
                'id': user.id,
                'preferred_language': 'fr',
                'dark_mode': True
            })
        
        updated_count = await user_repository.bulk_update(updates)
        
        assert updated_count == 3
        
        # Verify updates
        for user_id in [u['id'] for u in updates]:
            user = await user_repository.get(user_id)
            assert user.preferred_language == 'fr'
            assert user.dark_mode is True
    
    @pytest.mark.asyncio
    async def test_bulk_delete(self, user_repository, multiple_users):
        """Test bulk deleting entities."""
        user_ids = [user.id for user in multiple_users[:3]]
        
        deleted_count = await user_repository.bulk_delete(user_ids)
        
        assert deleted_count == 3
        
        # Verify deletions
        for user_id in user_ids:
            user = await user_repository.get(user_id, raise_not_found=False)
            assert user is None
    
    @pytest.mark.asyncio
    async def test_transaction_context_manager(self, user_repository, sample_user_data):
        """Test transaction context manager."""
        async with user_repository.transaction():
            user = await user_repository.create(sample_user_data, commit=False)
            assert user.id is not None
            
            # Update the user within the transaction
            await user_repository.update(
                user.id,
                {'preferred_language': 'es'},
                commit=False
            )
        
        # Verify changes were committed
        user = await user_repository.get(user.id)
        assert user.preferred_language == 'es'
    
    @pytest.mark.asyncio
    async def test_transaction_rollback_on_error(self, user_repository, sample_user_data):
        """Test that transaction rolls back on error."""
        with pytest.raises(Exception):
            async with user_repository.transaction():
                await user_repository.create(sample_user_data, commit=False)
                
                # Force an error
                raise Exception("Test error")
        
        # Verify no user was created
        users = await user_repository.get_multi()
        assert len(users) == 0
    
    @pytest.mark.asyncio
    async def test_cache_functionality(self, user_repository, created_user):
        """Test caching functionality."""
        # Enable cache
        user_repository.enable_cache(ttl_minutes=1)
        
        # First access - should cache
        user1 = await user_repository.get(created_user.id)
        
        # Second access - should use cache
        user2 = await user_repository.get(created_user.id)
        
        assert user1.id == user2.id
        
        # Clear cache and verify
        user_repository.clear_cache()
        user3 = await user_repository.get(created_user.id)
        assert user3.id == created_user.id
        
        # Disable cache
        user_repository.disable_cache()
    
    @pytest.mark.asyncio
    async def test_apply_filters_with_range_queries(self, user_repository):
        """Test applying filters with range queries."""
        # Create users with different creation dates
        now = datetime.utcnow()
        users_data = []
        
        for i in range(3):
            user_data = {
                'username': f'dateuser{i}',
                'email': f'date{i}@example.com',
                'preferred_language': 'en'
            }
            user = await user_repository.create(user_data, commit=False)
            # Manually set created_at for testing
            user.created_at = now - timedelta(days=i)
            users_data.append(user)
        
        await user_repository.session.commit()
        
        # Test range filter
        one_day_ago = now - timedelta(days=1)
        recent_users = await user_repository.get_multi(
            filters={
                'created_at': {'gte': one_day_ago}
            }
        )
        
        # Should find users created today and yesterday
        assert len(recent_users) >= 2
    
    @pytest.mark.asyncio
    async def test_apply_filters_with_list_values(self, user_repository, multiple_users):
        """Test applying filters with list values (IN queries)."""
        # Update some users' languages
        await user_repository.update(multiple_users[0].id, {'preferred_language': 'es'})
        await user_repository.update(multiple_users[1].id, {'preferred_language': 'fr'})
        
        # Filter by language list
        multilingual_users = await user_repository.get_multi(
            filters={'preferred_language': ['es', 'fr']}
        )
        
        assert len(multilingual_users) == 2
        languages = {user.preferred_language for user in multilingual_users}
        assert languages == {'es', 'fr'}
    
    @pytest.mark.asyncio
    async def test_validation_error_handling(self, user_repository):
        """Test validation error handling."""
        # Test duplicate username (should raise ValidationError)
        user_data = {
            'username': 'duplicate_test',
            'email': 'test1@example.com',
            'preferred_language': 'en'
        }
        
        # Create first user
        await user_repository.create(user_data)
        
        # Try to create second user with same username
        user_data2 = {
            'username': 'duplicate_test',  # Same username
            'email': 'test2@example.com',
            'preferred_language': 'en'
        }
        
        with pytest.raises(ValidationError):
            await user_repository.create(user_data2)
    
    @pytest.mark.asyncio
    async def test_repository_error_handling(self, user_repository):
        """Test repository error handling."""
        # Test with invalid data that should cause a repository error
        invalid_data = {
            'username': 'test',
            'email': 'invalid-email-format',  # This should fail validation
            'preferred_language': 'invalid_lang'  # This should fail validation
        }
        
        with pytest.raises((ValidationError, RepositoryError)):
            await user_repository.create(invalid_data)