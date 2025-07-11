"""Tests for UserRepository."""

import pytest
from datetime import datetime, timedelta

from database.repositories.base import RepositoryError, NotFoundError, ValidationError
from tests.test_repositories.conftest import create_test_interactions


class TestUserRepository:
    """Test suite for UserRepository."""
    
    @pytest.mark.asyncio
    async def test_get_or_create_by_device_uuid_new_user(self, user_repository):
        """Test creating a new user by device UUID."""
        device_uuid = "test-device-123"
        
        user, created = await user_repository.get_or_create_by_device_uuid(
            device_uuid=device_uuid,
            username="custom_username",
            email="custom@example.com"
        )
        
        assert created is True
        assert user.username == "custom_username"
        assert user.email == "custom@example.com"
        assert user.preferred_language == 'en'
        
        # Verify user stats were created
        from database.models import UserStats
        from sqlalchemy import select
        
        stats_query = select(UserStats).where(UserStats.user_id == user.id)
        result = await user_repository.session.execute(stats_query)
        user_stats = result.scalar_one_or_none()
        assert user_stats is not None
    
    @pytest.mark.asyncio
    async def test_get_or_create_by_device_uuid_existing_user(self, user_repository):
        """Test getting existing user by device UUID."""
        device_uuid = "existing-device-456"
        
        # Create user first time
        user1, created1 = await user_repository.get_or_create_by_device_uuid(
            device_uuid=device_uuid
        )
        assert created1 is True
        
        # Get same user second time
        user2, created2 = await user_repository.get_or_create_by_device_uuid(
            device_uuid=device_uuid
        )
        assert created2 is False
        assert user1.id == user2.id
    
    @pytest.mark.asyncio
    async def test_get_or_create_with_default_values(self, user_repository):
        """Test user creation with default values when none provided."""
        device_uuid = "default-device-789"
        
        user, created = await user_repository.get_or_create_by_device_uuid(
            device_uuid=device_uuid
        )
        
        assert created is True
        assert user.username == device_uuid  # Should use device_uuid as username
        assert device_uuid in user.email  # Should generate email with device_uuid
        assert user.preferred_language == 'en'
    
    @pytest.mark.asyncio
    async def test_update_preferences_valid(self, user_repository, created_user):
        """Test updating user preferences with valid data."""
        preferences = {
            'preferred_language': 'es',
            'dark_mode': True,
            'notifications_enabled': False,
            'notification_time': '08:30'
        }
        
        updated_user = await user_repository.update_preferences(
            user_id=created_user.id,
            preferences=preferences
        )
        
        assert updated_user.preferred_language == 'es'
        assert updated_user.dark_mode is True
        assert updated_user.notifications_enabled is False
        assert updated_user.notification_time == '08:30'
        assert updated_user.updated_at is not None
    
    @pytest.mark.asyncio
    async def test_update_preferences_filtered_fields(self, user_repository, created_user):
        """Test that only allowed preference fields are updated."""
        preferences = {
            'preferred_language': 'fr',
            'username': 'hacker_attempt',  # This should be ignored
            'email': 'hacker@evil.com',    # This should be ignored
            'dark_mode': True              # This should be applied
        }
        
        original_username = created_user.username
        original_email = created_user.email
        
        updated_user = await user_repository.update_preferences(
            user_id=created_user.id,
            preferences=preferences
        )
        
        # Allowed fields should be updated
        assert updated_user.preferred_language == 'fr'
        assert updated_user.dark_mode is True
        
        # Disallowed fields should remain unchanged
        assert updated_user.username == original_username
        assert updated_user.email == original_email
    
    @pytest.mark.asyncio
    async def test_update_preferences_invalid_language(self, user_repository, created_user):
        """Test updating preferences with invalid language."""
        preferences = {
            'preferred_language': 'invalid_lang'
        }
        
        with pytest.raises(ValidationError, match="Invalid language"):
            await user_repository.update_preferences(
                user_id=created_user.id,
                preferences=preferences
            )
    
    @pytest.mark.asyncio
    async def test_update_preferences_invalid_time_format(self, user_repository, created_user):
        """Test updating preferences with invalid notification time format."""
        preferences = {
            'notification_time': '25:99'  # Invalid time
        }
        
        with pytest.raises(ValidationError, match="Invalid notification time format"):
            await user_repository.update_preferences(
                user_id=created_user.id,
                preferences=preferences
            )
    
    @pytest.mark.asyncio
    async def test_update_preferences_nonexistent_user(self, user_repository):
        """Test updating preferences for non-existent user."""
        with pytest.raises(NotFoundError):
            await user_repository.update_preferences(
                user_id="nonexistent-user-id",
                preferences={'dark_mode': True}
            )
    
    @pytest.mark.asyncio
    async def test_get_user_profile_complete(
        self,
        user_repository,
        joke_repository,
        interaction_repository,
        created_user,
        multiple_jokes
    ):
        """Test getting complete user profile with statistics."""
        # Create some interactions
        for i, joke in enumerate(multiple_jokes[:3]):
            interaction_type = 'like' if i % 2 == 0 else 'view'
            await interaction_repository.record_feedback(
                user_id=created_user.id,
                joke_id=joke.id,
                interaction_type=interaction_type
            )
        
        # Get user profile
        profile = await user_repository.get_user_profile(created_user.id)
        
        # Verify profile structure
        assert profile['id'] == created_user.id
        assert profile['username'] == created_user.username
        assert profile['email'] == created_user.email
        assert 'statistics' in profile
        assert 'recent_activity' in profile
        
        # Verify statistics
        stats = profile['statistics']
        assert 'jokes_viewed' in stats
        assert 'jokes_liked' in stats
        assert 'jokes_skipped' in stats
        assert 'favorites_count' in stats
        assert 'interaction_stats' in stats
        assert 'favorite_categories' in stats
    
    @pytest.mark.asyncio
    async def test_get_users_by_activity(
        self,
        user_repository,
        interaction_repository,
        multiple_users,
        multiple_jokes
    ):
        """Test getting users by activity level."""
        # Create interactions for some users to make them active
        active_users = multiple_users[:3]
        for user in active_users:
            for joke in multiple_jokes[:5]:  # Each active user interacts with 5 jokes
                await interaction_repository.record_feedback(
                    user_id=user.id,
                    joke_id=joke.id,
                    interaction_type='view'
                )
        
        # Get active users
        active_users_result = await user_repository.get_users_by_activity(
            activity_threshold_days=7,
            min_interactions=3,
            limit=10
        )
        
        assert len(active_users_result) >= 3  # Should include our active users
        
        # Verify they have user stats loaded
        for user in active_users_result:
            assert hasattr(user, 'user_stats')
    
    @pytest.mark.asyncio
    async def test_get_users_with_similar_preferences(
        self,
        user_repository,
        joke_repository,
        interaction_repository,
        multiple_users,
        multiple_jokes,
        session
    ):
        """Test finding users with similar preferences."""
        # Create favorites for users to establish preferences
        from database.models import Favorite
        
        # User 1 likes funny and puns
        user1 = multiple_users[0]
        funny_jokes = [j for j in multiple_jokes if j.category == 'funny']
        pun_jokes = [j for j in multiple_jokes if j.category == 'puns']
        
        for joke in funny_jokes[:2] + pun_jokes[:2]:
            favorite = Favorite(user_id=user1.id, joke_id=joke.id)
            session.add(favorite)
        
        # User 2 also likes funny (similar preference)
        user2 = multiple_users[1]
        for joke in funny_jokes[:3]:
            favorite = Favorite(user_id=user2.id, joke_id=joke.id)
            session.add(favorite)
        
        await session.commit()
        
        # Find similar users
        similar_users = await user_repository.get_users_with_similar_preferences(
            user_id=user1.id,
            limit=10
        )
        
        # Should include user2 since they both like funny jokes
        similar_user_ids = {user.id for user in similar_users}
        assert user2.id in similar_user_ids
    
    @pytest.mark.asyncio
    async def test_get_user_engagement_metrics(
        self,
        user_repository,
        interaction_repository,
        created_user,
        multiple_jokes
    ):
        """Test getting detailed engagement metrics for a user."""
        # Create varied interactions over time
        for i, joke in enumerate(multiple_jokes[:5]):
            interaction_types = ['view', 'like', 'skip']
            interaction_type = interaction_types[i % len(interaction_types)]
            
            await interaction_repository.record_feedback(
                user_id=created_user.id,
                joke_id=joke.id,
                interaction_type=interaction_type
            )
        
        # Get engagement metrics
        metrics = await user_repository.get_user_engagement_metrics(
            user_id=created_user.id,
            days=30
        )
        
        # Verify metrics structure
        assert 'period_days' in metrics
        assert 'total_interactions' in metrics
        assert 'total_views' in metrics
        assert 'total_likes' in metrics
        assert 'total_skips' in metrics
        assert 'engagement_rate' in metrics
        assert 'skip_rate' in metrics
        assert 'activity_streak' in metrics
        assert 'daily_breakdown' in metrics
        assert 'avg_daily_interactions' in metrics
        
        # Verify calculations
        assert metrics['total_interactions'] > 0
        assert 0 <= metrics['engagement_rate'] <= 100
        assert 0 <= metrics['skip_rate'] <= 100
    
    @pytest.mark.asyncio
    async def test_deactivate_user(self, user_repository, created_user):
        """Test deactivating a user account."""
        original_username = created_user.username
        original_email = created_user.email
        
        result = await user_repository.deactivate_user(created_user.id)
        
        assert result is True
        
        # Verify user was deactivated
        updated_user = await user_repository.get(created_user.id)
        assert updated_user.username != original_username
        assert updated_user.email != original_email
        assert 'deactivated' in updated_user.username
        assert 'deactivated' in updated_user.email
    
    @pytest.mark.asyncio
    async def test_deactivate_nonexistent_user(self, user_repository):
        """Test deactivating non-existent user."""
        result = await user_repository.deactivate_user("nonexistent-user-id")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_merge_users(
        self,
        user_repository,
        interaction_repository,
        multiple_users,
        multiple_jokes,
        session
    ):
        """Test merging two user accounts."""
        primary_user = multiple_users[0]
        secondary_user = multiple_users[1]
        
        # Create data for both users
        from database.models import Favorite
        
        # Primary user interactions
        await interaction_repository.record_feedback(
            user_id=primary_user.id,
            joke_id=multiple_jokes[0].id,
            interaction_type='like'
        )
        
        # Secondary user interactions and favorites
        await interaction_repository.record_feedback(
            user_id=secondary_user.id,
            joke_id=multiple_jokes[1].id,
            interaction_type='view'
        )
        
        favorite = Favorite(user_id=secondary_user.id, joke_id=multiple_jokes[1].id)
        session.add(favorite)
        await session.commit()
        
        # Merge users
        merged_user = await user_repository.merge_users(
            primary_user_id=primary_user.id,
            secondary_user_id=secondary_user.id
        )
        
        assert merged_user.id == primary_user.id
        
        # Verify secondary user was deleted
        deleted_user = await user_repository.get(secondary_user.id, raise_not_found=False)
        assert deleted_user is None
        
        # Verify data was moved to primary user
        # (Would need to check interactions and favorites tables)
    
    @pytest.mark.asyncio
    async def test_bulk_update_preferences(self, user_repository, multiple_users):
        """Test bulk updating user preferences."""
        # Prepare bulk updates
        updates = []
        for i, user in enumerate(multiple_users[:3]):
            updates.append({
                'user_id': user.id,
                'dark_mode': True,
                'preferred_language': 'es' if i % 2 == 0 else 'fr'
            })
        
        # Perform bulk update
        updated_count = await user_repository.bulk_update_preferences(updates)
        
        assert updated_count == 3
        
        # Verify updates
        for i, user_id in enumerate([u['user_id'] for u in updates]):
            user = await user_repository.get(user_id)
            assert user.dark_mode is True
            expected_lang = 'es' if i % 2 == 0 else 'fr'
            assert user.preferred_language == expected_lang
    
    @pytest.mark.asyncio
    async def test_cleanup_inactive_users_dry_run(
        self,
        user_repository,
        multiple_users
    ):
        """Test identifying inactive users without deleting them."""
        # Get inactive users (dry run)
        inactive_users = await user_repository.cleanup_inactive_users(
            inactive_days=1,  # Very short period to catch our test users
            dry_run=True
        )
        
        # Should identify users but not delete them
        assert len(inactive_users) > 0
        
        # Verify users still exist
        for user in multiple_users:
            existing_user = await user_repository.get(user.id, raise_not_found=False)
            assert existing_user is not None
    
    @pytest.mark.asyncio
    async def test_cleanup_inactive_users_actual_deletion(
        self,
        user_repository,
        multiple_users
    ):
        """Test actually deleting inactive users."""
        original_count = len(multiple_users)
        
        # Delete inactive users
        inactive_users = await user_repository.cleanup_inactive_users(
            inactive_days=1,  # Very short period
            dry_run=False
        )
        
        assert len(inactive_users) > 0
        
        # Verify users were deleted
        remaining_count = await user_repository.count()
        assert remaining_count < original_count
    
    @pytest.mark.asyncio
    async def test_validation_create_duplicate_username(self, user_repository, created_user):
        """Test validation error when creating user with duplicate username."""
        duplicate_data = {
            'username': created_user.username,  # Same username
            'email': 'different@example.com',
            'preferred_language': 'en'
        }
        
        with pytest.raises(ValidationError, match="Username .* already exists"):
            await user_repository.create(duplicate_data)
    
    @pytest.mark.asyncio
    async def test_validation_create_duplicate_email(self, user_repository, created_user):
        """Test validation error when creating user with duplicate email."""
        duplicate_data = {
            'username': 'different_username',
            'email': created_user.email,  # Same email
            'preferred_language': 'en'
        }
        
        with pytest.raises(ValidationError, match="Email .* already exists"):
            await user_repository.create(duplicate_data)
    
    @pytest.mark.asyncio
    async def test_empty_preferences_update(self, user_repository, created_user):
        """Test updating user with no valid preferences."""
        invalid_preferences = {
            'invalid_field': 'value',
            'another_invalid': 123
        }
        
        # Should not raise error but also not change anything
        updated_user = await user_repository.update_preferences(
            user_id=created_user.id,
            preferences=invalid_preferences
        )
        
        # User should be unchanged
        assert updated_user.id == created_user.id
        assert updated_user.username == created_user.username
    
    @pytest.mark.asyncio
    async def test_get_user_profile_nonexistent(self, user_repository):
        """Test getting profile for non-existent user."""
        with pytest.raises((NotFoundError, RepositoryError)):
            await user_repository.get_user_profile("nonexistent-user-id")
    
    @pytest.mark.asyncio
    async def test_activity_streak_calculation(
        self,
        user_repository,
        interaction_repository,
        created_user,
        multiple_jokes
    ):
        """Test activity streak calculation."""
        # Create interactions on consecutive days would require date manipulation
        # For now, just test that the method doesn't crash
        metrics = await user_repository.get_user_engagement_metrics(
            user_id=created_user.id,
            days=7
        )
        
        assert 'activity_streak' in metrics
        assert isinstance(metrics['activity_streak'], int)
        assert metrics['activity_streak'] >= 0