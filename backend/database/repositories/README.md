# Database Repository Layer

This repository layer provides a comprehensive, async-first data access layer for the GiggleGlide application with advanced features including caching, bulk operations, error handling, and performance optimization.

## Architecture Overview

The repository layer follows the Repository pattern with the following key components:

- **BaseRepository**: Generic CRUD operations with caching and transaction support
- **Specialized Repositories**: Domain-specific repositories with custom queries
- **Factory Pattern**: Centralized repository creation and management
- **Registry Pattern**: Dynamic repository registration and discovery

## Features

### Core Features
- ✅ Async/await support throughout
- ✅ Generic CRUD operations (Create, Read, Update, Delete)
- ✅ Bulk operations for high-performance data processing
- ✅ Query optimization with eager loading
- ✅ Comprehensive error handling and logging
- ✅ Transaction management with rollback support
- ✅ Caching layer with configurable TTL
- ✅ Pagination and filtering support

### Advanced Features
- ✅ Repository factory and registry pattern
- ✅ Health checks and monitoring
- ✅ Performance metrics and query optimization
- ✅ Concurrent operation support
- ✅ Connection pool management
- ✅ Validation and data integrity checks

## Repository Classes

### BaseRepository

The foundation class providing generic CRUD operations:

```python
from database.repositories import BaseRepository

class MyRepository(BaseRepository[Model, CreateSchema, UpdateSchema]):
    def __init__(self, session: AsyncSession):
        super().__init__(Model, session)
    
    async def get_specialized_query(self, **kwargs):
        # Implement custom queries here
        return select(self.model).where(...)
```

### JokeRepository

Specialized repository for joke operations:

```python
from database.repositories import JokeRepository

joke_repo = JokeRepository(session)

# Get random unseen jokes for a user
jokes = await joke_repo.get_random_unseen(
    user_id="user-123",
    category="funny",
    limit=10
)

# Mark joke as seen
interaction = await joke_repo.mark_as_seen(
    user_id="user-123",
    joke_id="joke-456",
    interaction_type="like"
)

# Get trending jokes
trending = await joke_repo.get_trending_jokes(
    time_window_hours=24,
    limit=10
)
```

### UserRepository

User management and analytics:

```python
from database.repositories import UserRepository

user_repo = UserRepository(session)

# Get or create user by device UUID
user, created = await user_repo.get_or_create_by_device_uuid(
    device_uuid="device-123",
    username="john_doe",
    email="john@example.com"
)

# Update user preferences
updated_user = await user_repo.update_preferences(
    user_id=user.id,
    preferences={
        "dark_mode": True,
        "preferred_language": "es",
        "notifications_enabled": False
    }
)

# Get user engagement metrics
metrics = await user_repo.get_user_engagement_metrics(
    user_id=user.id,
    days=30
)
```

### CategoryRepository

Category and tag management:

```python
from database.repositories import CategoryRepository

category_repo = CategoryRepository(session)

# Get all categories with statistics
categories = await category_repo.get_all_by_category(
    language="en",
    include_joke_count=True,
    min_jokes=5
)

# Get popular categories
popular = await category_repo.get_popular(
    time_window_days=7,
    metric="interactions",
    limit=10
)

# Get category performance metrics
performance = await category_repo.get_category_performance(
    category_name="funny",
    language="en"
)
```

### InteractionRepository

User feedback and sentiment tracking:

```python
from database.repositories import InteractionRepository

interaction_repo = InteractionRepository(session)

# Record user feedback
interaction = await interaction_repo.record_feedback(
    user_id="user-123",
    joke_id="joke-456",
    interaction_type="like",
    feedback_data={"rating": 5}
)

# Get user sentiment statistics
sentiment = await interaction_repo.get_user_sentiment_stats(
    user_id="user-123",
    time_window_days=30
)

# Analyze interaction patterns
patterns = await interaction_repo.get_interaction_patterns(
    user_id="user-123",
    days=7
)
```

## Repository Factory

The factory pattern provides centralized repository management:

```python
from database.repositories.factory import RepositoryFactory, create_repository_factory

# Create factory with health check
factory = await create_repository_factory(session)

# Get repositories
joke_repo = factory.get_joke_repository()
user_repo = factory.get_user_repository()
category_repo = factory.get_category_repository()
interaction_repo = factory.get_interaction_repository()

# Execute operations across multiple repositories
results = await factory.execute_in_repositories({
    'user': {
        'method': 'create',
        'args': [user_data]
    },
    'joke': {
        'method': 'bulk_create',
        'args': [joke_data_list]
    }
})

# Use transaction context
async with factory.transaction():
    user = await user_repo.create(user_data, commit=False)
    jokes = await joke_repo.bulk_create(joke_data_list, commit=False)
    # All operations committed together
```

## Error Handling

The repository layer provides comprehensive error handling:

```python
from database.repositories.base import (
    RepositoryError,
    ValidationError,
    NotFoundError,
    ConcurrencyError
)

try:
    user = await user_repo.create(user_data)
except ValidationError as e:
    # Handle validation errors (duplicate username, invalid email, etc.)
    logger.error(f"Validation failed: {e}")
except NotFoundError as e:
    # Handle entity not found errors
    logger.error(f"Entity not found: {e}")
except RepositoryError as e:
    # Handle general repository errors
    logger.error(f"Repository error: {e}")
```

## Performance Optimization

### Bulk Operations

```python
# Bulk create entities
users = await user_repo.bulk_create(user_data_list, batch_size=1000)

# Bulk update entities
update_data = [
    {'id': user1.id, 'dark_mode': True},
    {'id': user2.id, 'preferred_language': 'es'}
]
updated_count = await user_repo.bulk_update(update_data)

# Bulk delete entities
deleted_count = await user_repo.bulk_delete([user1.id, user2.id])
```

### Eager Loading

```python
# Load users with related data
users = await user_repo.get_multi(
    relationships=['user_stats', 'favorites'],
    limit=50
)
```

### Caching

```python
# Enable caching with 5-minute TTL
user_repo.enable_cache(ttl_minutes=5)

# First access loads from database
user1 = await user_repo.get(user_id)  # Database hit

# Second access uses cache
user2 = await user_repo.get(user_id)  # Cache hit

# Clear cache when needed
user_repo.clear_cache()
```

### Query Optimization

```python
# Use filters for efficient queries
recent_users = await user_repo.get_multi(
    filters={
        'created_at': {'gte': datetime.now() - timedelta(days=7)},
        'preferred_language': ['en', 'es']
    },
    order_by='created_at',
    order_desc=True,
    limit=100
)

# Use pagination for large datasets
page1 = await joke_repo.get_multi(skip=0, limit=20)
page2 = await joke_repo.get_multi(skip=20, limit=20)
```

## Transaction Management

```python
# Explicit transaction control
async with user_repo.transaction():
    user = await user_repo.create(user_data, commit=False)
    await user_repo.update(user.id, update_data, commit=False)
    # Automatically committed at end of context

# Factory-level transactions
async with factory.transaction():
    user = await user_repo.create(user_data, commit=False)
    jokes = await joke_repo.bulk_create(joke_data_list, commit=False)
    # All repositories share the same transaction
```

## Testing

The repository layer includes comprehensive tests:

```bash
# Run all repository tests
pytest tests/test_repositories/

# Run specific test categories
pytest tests/test_repositories/ -m "unit"
pytest tests/test_repositories/ -m "performance"

# Run with coverage
pytest tests/test_repositories/ --cov=database.repositories
```

### Test Structure

- `test_base_repository.py` - Tests for BaseRepository functionality
- `test_joke_repository.py` - Tests for JokeRepository
- `test_user_repository.py` - Tests for UserRepository
- `test_performance.py` - Performance and concurrency tests
- `conftest.py` - Test fixtures and configuration

## Monitoring and Health Checks

```python
# Repository health check
health = await factory.health_check()
print(health)
# {
#     'overall_healthy': True,
#     'repositories': {
#         'user': {'healthy': True, 'record_count': 1000},
#         'joke': {'healthy': True, 'record_count': 5000}
#     }
# }

# Cross-repository statistics
stats = await factory.get_cross_repository_stats()
print(stats)
# {
#     'total_jokes': 5000,
#     'total_users': 1000,
#     'total_categories': 25,
#     'total_interactions': 50000
# }
```

## Best Practices

### 1. Use Factories for Repository Management

```python
# ✅ Good - Use factory
async with session_factory() as session:
    factory = RepositoryFactory(session)
    user_repo = factory.get_user_repository()

# ❌ Avoid - Direct instantiation
user_repo = UserRepository(session)
```

### 2. Handle Errors Appropriately

```python
# ✅ Good - Specific error handling
try:
    user = await user_repo.get(user_id, raise_not_found=True)
except NotFoundError:
    return {"error": "User not found"}, 404
except RepositoryError as e:
    logger.error(f"Database error: {e}")
    return {"error": "Internal error"}, 500
```

### 3. Use Bulk Operations for Better Performance

```python
# ✅ Good - Bulk operations
await joke_repo.bulk_create(joke_data_list)

# ❌ Avoid - Individual creates in loop
for joke_data in joke_data_list:
    await joke_repo.create(joke_data)
```

### 4. Leverage Caching for Read-Heavy Operations

```python
# ✅ Good - Enable caching for frequently accessed data
user_repo.enable_cache(ttl_minutes=5)
popular_categories = await category_repo.get_popular()
```

### 5. Use Transactions for Related Operations

```python
# ✅ Good - Atomic operations
async with factory.transaction():
    user = await user_repo.create(user_data, commit=False)
    await interaction_repo.record_feedback(
        user.id, joke_id, "like"
    )
```

## Configuration

### Database Connection

The repository layer works with the existing database configuration:

```python
from database.connection import get_async_db_session

async with get_async_db_session() as session:
    factory = RepositoryFactory(session)
    # Use repositories...
```

### Logging

Configure logging for repository operations:

```python
import logging

# Enable debug logging for repositories
logging.getLogger('database.repositories').setLevel(logging.DEBUG)
```

## Migration Guide

### From Direct SQLAlchemy Usage

Before:
```python
# Direct SQLAlchemy usage
async with session.begin():
    result = await session.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")
```

After:
```python
# Repository pattern
factory = RepositoryFactory(session)
user_repo = factory.get_user_repository()
try:
    user = await user_repo.get(user_id, raise_not_found=True)
except NotFoundError:
    raise ValueError("User not found")
```

### Benefits of Migration

1. **Type Safety**: Better type hints and IDE support
2. **Error Handling**: Consistent error handling across the application
3. **Performance**: Built-in caching and query optimization
4. **Testing**: Easier to mock and test
5. **Maintainability**: Centralized data access logic

## Contributing

When adding new repository functionality:

1. Extend the appropriate repository class
2. Add comprehensive tests
3. Update documentation
4. Consider performance implications
5. Add proper error handling

## API Reference

For detailed API documentation, see the docstrings in each repository class. The repositories provide a rich set of methods for data access and manipulation optimized for the GiggleGlide application's needs.