"""Performance and concurrency tests for repositories."""

import pytest
import asyncio
import time
from typing import List
from concurrent.futures import ThreadPoolExecutor

from database.repositories.factory import RepositoryFactory


class TestRepositoryPerformance:
    """Test suite for repository performance and concurrency."""
    
    @pytest.mark.asyncio
    async def test_bulk_operations_performance(
        self,
        user_repository,
        joke_repository
    ):
        """Test performance of bulk operations."""
        # Test bulk user creation
        user_data_list = [
            {
                'username': f'perfuser{i}',
                'email': f'perf{i}@example.com',
                'preferred_language': 'en'
            }
            for i in range(100)
        ]
        
        start_time = time.time()
        created_users = await user_repository.bulk_create(user_data_list)
        bulk_create_time = time.time() - start_time
        
        assert len(created_users) == 100
        assert bulk_create_time < 5.0  # Should complete within 5 seconds
        
        # Test bulk joke creation
        joke_data_list = [
            {
                'text': f'Performance test joke {i}',
                'category': f'category_{i % 5}',
                'language': 'en',
                'rating': 3.0,
                'view_count': 0,
                'like_count': 0
            }
            for i in range(200)
        ]
        
        start_time = time.time()
        created_jokes = await joke_repository.bulk_create(joke_data_list)
        bulk_joke_create_time = time.time() - start_time
        
        assert len(created_jokes) == 200
        assert bulk_joke_create_time < 10.0  # Should complete within 10 seconds
        
        print(f"Bulk user creation: {bulk_create_time:.2f}s for 100 users")
        print(f"Bulk joke creation: {bulk_joke_create_time:.2f}s for 200 jokes")
    
    @pytest.mark.asyncio
    async def test_query_performance_with_large_dataset(
        self,
        repository_factory: RepositoryFactory,
        large_dataset
    ):
        """Test query performance with larger datasets."""
        joke_repo = repository_factory.get_joke_repository()
        user_repo = repository_factory.get_user_repository()
        
        users = large_dataset['users']
        jokes = large_dataset['jokes']
        
        # Test random unseen jokes performance
        start_time = time.time()
        for i in range(10):  # Test 10 different users
            user = users[i]
            unseen_jokes = await joke_repo.get_random_unseen(
                user_id=user.id,
                limit=10
            )
            assert len(unseen_jokes) <= 10
        
        unseen_query_time = time.time() - start_time
        assert unseen_query_time < 5.0  # Should complete within 5 seconds
        
        # Test category-based queries performance
        start_time = time.time()
        for category in ['comedy', 'puns', 'oneliners']:
            category_jokes = await joke_repo.get_by_tags(
                categories=[category],
                limit=20
            )
            assert len(category_jokes) <= 20
        
        category_query_time = time.time() - start_time
        assert category_query_time < 3.0  # Should complete within 3 seconds
        
        # Test user search performance
        start_time = time.time()
        active_users = await user_repo.get_users_by_activity(
            activity_threshold_days=30,
            min_interactions=1,
            limit=20
        )
        user_query_time = time.time() - start_time
        assert user_query_time < 2.0  # Should complete within 2 seconds
        
        print(f"Random unseen queries: {unseen_query_time:.2f}s for 10 users")
        print(f"Category queries: {category_query_time:.2f}s for 3 categories")
        print(f"User activity query: {user_query_time:.2f}s")
    
    @pytest.mark.asyncio
    async def test_concurrent_read_operations(
        self,
        session_factory,
        large_dataset
    ):
        """Test concurrent read operations on repositories."""
        users = large_dataset['users']
        jokes = large_dataset['jokes']
        
        async def read_user_profile(user_id: str):
            """Read user profile in separate session."""
            async with session_factory() as session:
                user_repo = RepositoryFactory(session).get_user_repository()
                try:
                    profile = await user_repo.get_user_profile(user_id)
                    return profile['id']
                except:
                    # User might not have enough data for profile
                    user = await user_repo.get(user_id)
                    return user.id if user else None
        
        async def read_random_jokes(user_id: str):
            """Read random jokes in separate session."""
            async with session_factory() as session:
                joke_repo = RepositoryFactory(session).get_joke_repository()
                jokes = await joke_repo.get_random_unseen(
                    user_id=user_id,
                    limit=5
                )
                return len(jokes)
        
        # Run concurrent operations
        start_time = time.time()
        tasks = []
        
        # Create 20 concurrent read operations
        for i in range(20):
            user = users[i % len(users)]
            if i % 2 == 0:
                tasks.append(read_user_profile(user.id))
            else:
                tasks.append(read_random_jokes(user.id))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        concurrent_time = time.time() - start_time
        
        # Check that most operations succeeded
        successful_results = [r for r in results if not isinstance(r, Exception)]
        assert len(successful_results) >= 15  # At least 75% success rate
        assert concurrent_time < 10.0  # Should complete within 10 seconds
        
        print(f"Concurrent operations: {concurrent_time:.2f}s for 20 operations")
        print(f"Success rate: {len(successful_results)}/{len(results)}")
    
    @pytest.mark.asyncio
    async def test_concurrent_write_operations(
        self,
        session_factory,
        large_dataset
    ):
        """Test concurrent write operations with proper isolation."""
        users = large_dataset['users']
        jokes = large_dataset['jokes']
        
        async def create_interaction(user_id: str, joke_id: str, interaction_type: str):
            """Create interaction in separate session."""
            async with session_factory() as session:
                interaction_repo = RepositoryFactory(session).get_interaction_repository()
                try:
                    interaction = await interaction_repo.record_feedback(
                        user_id=user_id,
                        joke_id=joke_id,
                        interaction_type=interaction_type
                    )
                    return interaction.id
                except Exception as e:
                    # Might fail due to duplicates, which is expected
                    return None
        
        # Create concurrent interactions
        start_time = time.time()
        tasks = []
        
        import random
        interaction_types = ['view', 'like', 'skip']
        
        for i in range(30):
            user = random.choice(users)
            joke = random.choice(jokes)
            interaction_type = random.choice(interaction_types)
            
            tasks.append(create_interaction(user.id, joke.id, interaction_type))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        write_time = time.time() - start_time
        
        # Check that operations completed (some might fail due to duplicates)
        successful_results = [r for r in results if r is not None and not isinstance(r, Exception)]
        assert len(successful_results) >= 10  # At least some should succeed
        assert write_time < 15.0  # Should complete within 15 seconds
        
        print(f"Concurrent writes: {write_time:.2f}s for 30 operations")
        print(f"Successful writes: {len(successful_results)}/{len(results)}")
    
    @pytest.mark.asyncio
    async def test_transaction_performance(
        self,
        repository_factory: RepositoryFactory
    ):
        """Test performance of transaction operations."""
        user_repo = repository_factory.get_user_repository()
        joke_repo = repository_factory.get_joke_repository()
        interaction_repo = repository_factory.get_interaction_repository()
        
        # Test transaction with multiple operations
        start_time = time.time()
        
        async with repository_factory.transaction():
            # Create user
            user_data = {
                'username': 'transaction_user',
                'email': 'transaction@example.com',
                'preferred_language': 'en'
            }
            user = await user_repo.create(user_data, commit=False)
            
            # Create jokes
            joke_data_list = [
                {
                    'text': f'Transaction joke {i}',
                    'category': 'transaction_test',
                    'language': 'en',
                    'rating': 3.0,
                    'view_count': 0,
                    'like_count': 0
                }
                for i in range(10)
            ]
            created_jokes = await joke_repo.bulk_create(joke_data_list, commit=False)
            
            # Create interactions
            for joke in created_jokes[:5]:
                await interaction_repo.record_feedback(
                    user_id=user.id,
                    joke_id=joke.id,
                    interaction_type='view'
                )
        
        transaction_time = time.time() - start_time
        assert transaction_time < 5.0  # Should complete within 5 seconds
        
        print(f"Transaction with multiple operations: {transaction_time:.2f}s")
    
    @pytest.mark.asyncio
    async def test_pagination_performance(
        self,
        joke_repository,
        large_dataset
    ):
        """Test pagination performance with large datasets."""
        jokes = large_dataset['jokes']
        
        # Test paginating through all jokes
        start_time = time.time()
        page_size = 20
        total_fetched = 0
        skip = 0
        
        while True:
            page_jokes = await joke_repository.get_multi(
                skip=skip,
                limit=page_size,
                order_by='created_at'
            )
            
            if not page_jokes:
                break
            
            total_fetched += len(page_jokes)
            skip += page_size
            
            # Safety check to avoid infinite loop
            if skip > 1000:
                break
        
        pagination_time = time.time() - start_time
        assert total_fetched > 0
        assert pagination_time < 10.0  # Should complete within 10 seconds
        
        print(f"Pagination: {pagination_time:.2f}s for {total_fetched} jokes")
    
    @pytest.mark.asyncio
    async def test_complex_query_performance(
        self,
        repository_factory: RepositoryFactory,
        large_dataset
    ):
        """Test performance of complex queries."""
        joke_repo = repository_factory.get_joke_repository()
        category_repo = repository_factory.get_category_repository()
        
        users = large_dataset['users']
        
        # Test complex joke recommendation query
        start_time = time.time()
        for user in users[:5]:  # Test for 5 users
            recommendations = await joke_repo.get_recommended_jokes(
                user_id=user.id,
                limit=10
            )
        recommendation_time = time.time() - start_time
        
        # Test category statistics query
        start_time = time.time()
        category_stats = await joke_repo.get_category_stats()
        category_stats_time = time.time() - start_time
        
        # Test trending jokes query
        start_time = time.time()
        trending = await joke_repo.get_trending_jokes(
            time_window_hours=24,
            limit=10
        )
        trending_time = time.time() - start_time
        
        assert recommendation_time < 5.0
        assert category_stats_time < 3.0
        assert trending_time < 3.0
        
        print(f"Recommendations: {recommendation_time:.2f}s for 5 users")
        print(f"Category stats: {category_stats_time:.2f}s")
        print(f"Trending jokes: {trending_time:.2f}s")
    
    @pytest.mark.asyncio
    async def test_memory_usage_bulk_operations(
        self,
        user_repository
    ):
        """Test memory usage during bulk operations."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create large batch of users
        large_batch_size = 1000
        user_data_list = [
            {
                'username': f'memtest{i}',
                'email': f'memtest{i}@example.com',
                'preferred_language': 'en'
            }
            for i in range(large_batch_size)
        ]
        
        created_users = await user_repository.bulk_create(
            user_data_list,
            batch_size=100  # Process in smaller batches
        )
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        assert len(created_users) == large_batch_size
        assert memory_increase < 500  # Should not increase by more than 500MB
        
        print(f"Memory usage: {initial_memory:.1f}MB -> {final_memory:.1f}MB (+{memory_increase:.1f}MB)")
    
    @pytest.mark.asyncio
    async def test_connection_pool_stress(
        self,
        session_factory
    ):
        """Test repository performance under connection pool stress."""
        async def concurrent_database_operation(session_id: int):
            """Perform database operation in separate session."""
            async with session_factory() as session:
                factory = RepositoryFactory(session)
                user_repo = factory.get_user_repository()
                
                # Create and immediately delete a user
                user_data = {
                    'username': f'stress_user_{session_id}',
                    'email': f'stress_{session_id}@example.com',
                    'preferred_language': 'en'
                }
                
                user = await user_repo.create(user_data)
                await user_repo.delete(user.id)
                return session_id
        
        # Create many concurrent operations to stress the connection pool
        start_time = time.time()
        tasks = [concurrent_database_operation(i) for i in range(50)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        stress_time = time.time() - start_time
        
        # Check that most operations succeeded
        successful_results = [r for r in results if not isinstance(r, Exception)]
        success_rate = len(successful_results) / len(results)
        
        assert success_rate > 0.8  # At least 80% success rate
        assert stress_time < 30.0  # Should complete within 30 seconds
        
        print(f"Connection pool stress: {stress_time:.2f}s for 50 operations")
        print(f"Success rate: {success_rate:.1%}")
    
    @pytest.mark.asyncio
    async def test_query_optimization_with_relationships(
        self,
        repository_factory: RepositoryFactory,
        large_dataset
    ):
        """Test query optimization when loading relationships."""
        user_repo = repository_factory.get_user_repository()
        users = large_dataset['users']
        
        # Test loading users without relationships
        start_time = time.time()
        users_no_rel = await user_repo.get_multi(
            limit=20,
            relationships=[]  # No relationships
        )
        no_rel_time = time.time() - start_time
        
        # Test loading users with relationships
        start_time = time.time()
        users_with_rel = await user_repo.get_multi(
            limit=20,
            relationships=['user_stats', 'favorites']  # With relationships
        )
        with_rel_time = time.time() - start_time
        
        assert len(users_no_rel) == len(users_with_rel)
        
        # With relationships should be slower but not dramatically so
        assert with_rel_time < no_rel_time * 5  # Less than 5x slower
        
        print(f"Query without relationships: {no_rel_time:.3f}s")
        print(f"Query with relationships: {with_rel_time:.3f}s")
        print(f"Relationship loading overhead: {(with_rel_time/no_rel_time - 1)*100:.1f}%")


@pytest.mark.asyncio
async def test_repository_factory_performance(session_factory):
    """Test performance of repository factory operations."""
    async with session_factory() as session:
        # Test factory creation and repository access
        start_time = time.time()
        
        for _ in range(100):
            factory = RepositoryFactory(session)
            user_repo = factory.get_user_repository()
            joke_repo = factory.get_joke_repository()
            category_repo = factory.get_category_repository()
            interaction_repo = factory.get_interaction_repository()
            
            # Verify repositories are properly initialized
            assert user_repo is not None
            assert joke_repo is not None
            assert category_repo is not None
            assert interaction_repo is not None
        
        factory_time = time.time() - start_time
        assert factory_time < 1.0  # Should complete within 1 second
        
        print(f"Factory creation: {factory_time:.3f}s for 100 iterations")


@pytest.mark.asyncio 
async def test_cache_performance(user_repository, created_user):
    """Test repository caching performance."""
    user_repository.enable_cache(ttl_minutes=5)
    
    # Test cache miss (first access)
    start_time = time.time()
    user1 = await user_repository.get(created_user.id)
    cache_miss_time = time.time() - start_time
    
    # Test cache hit (second access)
    start_time = time.time()
    user2 = await user_repository.get(created_user.id)
    cache_hit_time = time.time() - start_time
    
    assert user1.id == user2.id
    # Cache hit should be significantly faster
    assert cache_hit_time < cache_miss_time * 0.5
    
    user_repository.disable_cache()
    
    print(f"Cache miss: {cache_miss_time:.4f}s")
    print(f"Cache hit: {cache_hit_time:.4f}s")
    print(f"Cache speedup: {cache_miss_time/cache_hit_time:.1f}x")