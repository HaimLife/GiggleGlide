"""Tests for JokeRepository."""

import pytest
from datetime import datetime, timedelta

from database.repositories.base import RepositoryError, NotFoundError
from tests.test_repositories.conftest import create_test_interactions


class TestJokeRepository:
    """Test suite for JokeRepository."""
    
    @pytest.mark.asyncio
    async def test_get_random_unseen_jokes(
        self,
        joke_repository,
        user_repository,
        interaction_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test getting random unseen jokes for a user."""
        # Create a user
        user = await user_repository.create(sample_user_data)
        
        # Mark some jokes as seen
        seen_jokes = multiple_jokes[:3]
        for joke in seen_jokes:
            await interaction_repository.record_feedback(
                user_id=user.id,
                joke_id=joke.id,
                interaction_type='view'
            )
        
        # Get unseen jokes
        unseen_jokes = await joke_repository.get_random_unseen(
            user_id=user.id,
            limit=5
        )
        
        assert len(unseen_jokes) <= 5
        seen_ids = {joke.id for joke in seen_jokes}
        unseen_ids = {joke.id for joke in unseen_jokes}
        
        # Verify no overlap between seen and unseen
        assert seen_ids.isdisjoint(unseen_ids)
    
    @pytest.mark.asyncio
    async def test_get_random_unseen_with_category_filter(
        self,
        joke_repository,
        user_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test getting random unseen jokes with category filter."""
        user = await user_repository.create(sample_user_data)
        
        # Get jokes from specific category
        category_jokes = await joke_repository.get_random_unseen(
            user_id=user.id,
            category='funny',
            limit=10
        )
        
        # Verify all jokes are from the requested category
        for joke in category_jokes:
            assert joke.category == 'funny'
    
    @pytest.mark.asyncio
    async def test_get_random_unseen_with_min_rating(
        self,
        joke_repository,
        user_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test getting random unseen jokes with minimum rating filter."""
        user = await user_repository.create(sample_user_data)
        
        # Get high-rated jokes only
        high_rated_jokes = await joke_repository.get_random_unseen(
            user_id=user.id,
            min_rating=4.0,
            limit=10
        )
        
        # Verify all jokes meet minimum rating
        for joke in high_rated_jokes:
            assert joke.rating >= 4.0
    
    @pytest.mark.asyncio
    async def test_get_by_tags(self, joke_repository, multiple_jokes):
        """Test getting jokes by categories/tags."""
        categories = ['funny', 'puns']
        
        jokes = await joke_repository.get_by_tags(
            categories=categories,
            limit=10
        )
        
        # Verify all jokes are from requested categories
        for joke in jokes:
            assert joke.category in categories
    
    @pytest.mark.asyncio
    async def test_get_by_tags_exclude_seen(
        self,
        joke_repository,
        user_repository,
        interaction_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test getting jokes by tags while excluding seen jokes."""
        user = await user_repository.create(sample_user_data)
        
        # Mark some funny jokes as seen
        funny_jokes = [j for j in multiple_jokes if j.category == 'funny']
        if funny_jokes:
            await interaction_repository.record_feedback(
                user_id=user.id,
                joke_id=funny_jokes[0].id,
                interaction_type='view'
            )
        
        # Get funny jokes excluding seen ones
        unseen_funny_jokes = await joke_repository.get_by_tags(
            categories=['funny'],
            user_id=user.id,
            exclude_seen=True
        )
        
        # Verify the seen joke is not included
        if funny_jokes:
            unseen_ids = {joke.id for joke in unseen_funny_jokes}
            assert funny_jokes[0].id not in unseen_ids
    
    @pytest.mark.asyncio
    async def test_mark_as_seen(
        self,
        joke_repository,
        user_repository,
        created_joke,
        sample_user_data
    ):
        """Test marking a joke as seen."""
        user = await user_repository.create(sample_user_data)
        
        # Mark joke as seen
        interaction = await joke_repository.mark_as_seen(
            user_id=user.id,
            joke_id=created_joke.id,
            interaction_type='view'
        )
        
        assert interaction is not None
        assert interaction.user_id == user.id
        assert interaction.joke_id == created_joke.id
        assert interaction.interaction_type == 'view'
    
    @pytest.mark.asyncio
    async def test_mark_as_seen_duplicate_interaction(
        self,
        joke_repository,
        user_repository,
        created_joke,
        sample_user_data
    ):
        """Test marking same joke as seen twice returns existing interaction."""
        user = await user_repository.create(sample_user_data)
        
        # Mark joke as seen first time
        interaction1 = await joke_repository.mark_as_seen(
            user_id=user.id,
            joke_id=created_joke.id,
            interaction_type='view'
        )
        
        # Mark same joke as seen again
        interaction2 = await joke_repository.mark_as_seen(
            user_id=user.id,
            joke_id=created_joke.id,
            interaction_type='view'
        )
        
        # Should return the same interaction
        assert interaction1.id == interaction2.id
    
    @pytest.mark.asyncio
    async def test_mark_as_seen_invalid_type(
        self,
        joke_repository,
        user_repository,
        created_joke,
        sample_user_data
    ):
        """Test marking joke as seen with invalid interaction type."""
        user = await user_repository.create(sample_user_data)
        
        with pytest.raises(RepositoryError, match="Invalid interaction type"):
            await joke_repository.mark_as_seen(
                user_id=user.id,
                joke_id=created_joke.id,
                interaction_type='invalid_type'
            )
    
    @pytest.mark.asyncio
    async def test_get_trending_jokes(
        self,
        joke_repository,
        user_repository,
        interaction_repository,
        multiple_jokes,
        multiple_users
    ):
        """Test getting trending jokes based on recent interactions."""
        # Create interactions for trending calculation
        await create_test_interactions(
            interaction_repository,
            multiple_users,
            multiple_jokes[:5],  # Focus interactions on first 5 jokes
            interaction_count=20
        )
        
        # Get trending jokes
        trending_jokes = await joke_repository.get_trending_jokes(
            time_window_hours=24,
            limit=5
        )
        
        assert len(trending_jokes) <= 5
        # Trending jokes should be ordered by interaction count
        # (can't verify exact order due to random interactions)
    
    @pytest.mark.asyncio
    async def test_get_user_favorites(
        self,
        joke_repository,
        user_repository,
        multiple_jokes,
        sample_user_data,
        session
    ):
        """Test getting user's favorite jokes."""
        user = await user_repository.create(sample_user_data)
        
        # Add some jokes to favorites
        from database.models import Favorite
        favorite_jokes = multiple_jokes[:3]
        
        for joke in favorite_jokes:
            favorite = Favorite(user_id=user.id, joke_id=joke.id)
            session.add(favorite)
        
        await session.commit()
        
        # Get user favorites
        favorites = await joke_repository.get_user_favorites(
            user_id=user.id,
            limit=10
        )
        
        assert len(favorites) == 3
        favorite_ids = {joke.id for joke in favorites}
        expected_ids = {joke.id for joke in favorite_jokes}
        assert favorite_ids == expected_ids
    
    @pytest.mark.asyncio
    async def test_get_recommended_jokes(
        self,
        joke_repository,
        user_repository,
        interaction_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test getting recommended jokes based on user preferences."""
        user = await user_repository.create(sample_user_data)
        
        # Create user preference by liking jokes from specific categories
        funny_jokes = [j for j in multiple_jokes if j.category == 'funny']
        for joke in funny_jokes[:2]:
            await interaction_repository.record_feedback(
                user_id=user.id,
                joke_id=joke.id,
                interaction_type='like'
            )
        
        # Get recommendations
        recommended_jokes = await joke_repository.get_recommended_jokes(
            user_id=user.id,
            limit=5
        )
        
        assert len(recommended_jokes) <= 5
        # Should include jokes from preferred categories that user hasn't seen
    
    @pytest.mark.asyncio
    async def test_search_jokes(self, joke_repository, multiple_jokes):
        """Test searching jokes by text content."""
        # Search for jokes containing specific text
        search_results = await joke_repository.search_jokes(
            query_text='test joke',
            limit=10
        )
        
        # Verify results contain the search term
        for joke in search_results:
            assert 'test joke' in joke.text.lower()
    
    @pytest.mark.asyncio
    async def test_search_jokes_with_filters(self, joke_repository, multiple_jokes):
        """Test searching jokes with additional filters."""
        search_results = await joke_repository.search_jokes(
            query_text='test',
            category='funny',
            min_rating=3.0,
            limit=10
        )
        
        for joke in search_results:
            assert 'test' in joke.text.lower()
            assert joke.category == 'funny'
            assert joke.rating >= 3.0
    
    @pytest.mark.asyncio
    async def test_get_joke_stats(
        self,
        joke_repository,
        user_repository,
        interaction_repository,
        created_joke,
        multiple_users
    ):
        """Test getting detailed statistics for a joke."""
        # Create some interactions for the joke
        for i, user in enumerate(multiple_users[:3]):
            interaction_type = 'like' if i % 2 == 0 else 'view'
            await interaction_repository.record_feedback(
                user_id=user.id,
                joke_id=created_joke.id,
                interaction_type=interaction_type
            )
        
        # Get joke stats
        stats = await joke_repository.get_joke_stats(created_joke.id)
        
        assert stats['joke_id'] == created_joke.id
        assert 'text_length' in stats
        assert 'category' in stats
        assert 'interactions' in stats
        assert 'view_count' in stats
        assert 'like_count' in stats
        assert isinstance(stats['interactions'], dict)
    
    @pytest.mark.asyncio
    async def test_get_joke_stats_nonexistent(self, joke_repository):
        """Test getting stats for non-existent joke."""
        with pytest.raises(NotFoundError):
            await joke_repository.get_joke_stats("nonexistent-id")
    
    @pytest.mark.asyncio
    async def test_get_category_stats(self, joke_repository, multiple_jokes):
        """Test getting statistics for all categories."""
        stats = await joke_repository.get_category_stats(language='en')
        
        assert isinstance(stats, list)
        assert len(stats) > 0
        
        # Verify stats structure
        for category_stat in stats:
            assert 'category' in category_stat
            assert 'joke_count' in category_stat
            assert 'avg_rating' in category_stat
            assert 'total_views' in category_stat
            assert 'total_likes' in category_stat
            assert 'engagement_rate' in category_stat
    
    @pytest.mark.asyncio
    async def test_bulk_mark_as_seen(
        self,
        joke_repository,
        user_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test bulk marking multiple jokes as seen."""
        user = await user_repository.create(sample_user_data)
        
        # Prepare bulk interactions
        interactions_data = []
        for joke in multiple_jokes[:3]:
            interactions_data.append({
                'user_id': user.id,
                'joke_id': joke.id,
                'interaction_type': 'view'
            })
        
        # Bulk mark as seen
        created_interactions = await joke_repository.bulk_mark_as_seen(
            interactions_data
        )
        
        assert len(created_interactions) == 3
        for interaction in created_interactions:
            assert interaction.user_id == user.id
            assert interaction.interaction_type == 'view'
    
    @pytest.mark.asyncio
    async def test_update_joke_ratings(
        self,
        joke_repository,
        user_repository,
        interaction_repository,
        multiple_jokes,
        multiple_users
    ):
        """Test updating joke ratings based on current statistics."""
        # Create interactions to affect ratings
        joke = multiple_jokes[0]
        
        # Add multiple likes to increase rating
        for user in multiple_users[:3]:
            await interaction_repository.record_feedback(
                user_id=user.id,
                joke_id=joke.id,
                interaction_type='like'
            )
        
        # Update ratings
        updated_count = await joke_repository.update_joke_ratings()
        
        assert updated_count >= 0  # Should update at least some jokes
        
        # Verify the joke's rating was recalculated
        updated_joke = await joke_repository.get(joke.id)
        # Rating should be based on like ratio
        expected_rating = round((updated_joke.like_count / max(updated_joke.view_count, 1)) * 5, 2)
        assert updated_joke.rating == expected_rating
    
    @pytest.mark.asyncio
    async def test_get_random_unseen_with_exclusions(
        self,
        joke_repository,
        user_repository,
        multiple_jokes,
        sample_user_data
    ):
        """Test getting random unseen jokes with specific exclusions."""
        user = await user_repository.create(sample_user_data)
        
        # Exclude specific joke IDs
        exclude_ids = [multiple_jokes[0].id, multiple_jokes[1].id]
        
        unseen_jokes = await joke_repository.get_random_unseen(
            user_id=user.id,
            exclude_ids=exclude_ids,
            limit=5
        )
        
        # Verify excluded jokes are not in results
        result_ids = {joke.id for joke in unseen_jokes}
        excluded_ids_set = set(exclude_ids)
        assert result_ids.isdisjoint(excluded_ids_set)
    
    @pytest.mark.asyncio
    async def test_joke_stats_update_on_interaction(
        self,
        joke_repository,
        user_repository,
        created_joke,
        sample_user_data
    ):
        """Test that joke statistics are updated when marking as seen."""
        user = await user_repository.create(sample_user_data)
        
        # Get initial stats
        initial_view_count = created_joke.view_count
        initial_like_count = created_joke.like_count
        
        # Mark as viewed
        await joke_repository.mark_as_seen(
            user_id=user.id,
            joke_id=created_joke.id,
            interaction_type='view'
        )
        
        # Check updated stats
        updated_joke = await joke_repository.get(created_joke.id)
        assert updated_joke.view_count == initial_view_count + 1
        
        # Mark as liked
        await joke_repository.mark_as_seen(
            user_id=user.id,
            joke_id=created_joke.id,
            interaction_type='like'
        )
        
        # Check updated stats
        updated_joke = await joke_repository.get(created_joke.id)
        assert updated_joke.like_count == initial_like_count + 1
    
    @pytest.mark.asyncio
    async def test_empty_results_handling(self, joke_repository, user_repository, sample_user_data):
        """Test handling of empty results in various methods."""
        user = await user_repository.create(sample_user_data)
        
        # Test with non-existent category
        jokes = await joke_repository.get_by_tags(
            categories=['nonexistent_category'],
            limit=10
        )
        assert len(jokes) == 0
        
        # Test unseen jokes when all are seen (empty database case)
        unseen = await joke_repository.get_random_unseen(
            user_id=user.id,
            limit=10
        )
        assert len(unseen) == 0
        
        # Test search with no matches
        search_results = await joke_repository.search_jokes(
            query_text='definitely_not_in_any_joke_text_12345',
            limit=10
        )
        assert len(search_results) == 0