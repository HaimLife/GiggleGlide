"""Repository factory and registry for centralized repository management."""

from typing import Dict, Type, Optional, Any, TypeVar, Generic
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from functools import lru_cache
import asyncio
from contextlib import asynccontextmanager

from .base import BaseRepository
from .joke_repository import JokeRepository
from .user_repository import UserRepository
from .category_repository import CategoryRepository
from .interaction_repository import InteractionRepository
from ..models import Joke, User, Category, JokeInteraction

logger = logging.getLogger(__name__)

# Type variable for repository types
RepositoryType = TypeVar('RepositoryType', bound=BaseRepository)


class RepositoryRegistry:
    """Registry for managing repository instances and their dependencies."""
    
    def __init__(self):
        self._repositories: Dict[str, Type[BaseRepository]] = {}
        self._instances: Dict[str, BaseRepository] = {}
        self._sessions: Dict[str, AsyncSession] = {}
        self._default_session: Optional[AsyncSession] = None
        
        # Register built-in repositories
        self._register_default_repositories()
    
    def _register_default_repositories(self):
        """Register the default repository classes."""
        self.register('joke', JokeRepository, Joke)
        self.register('user', UserRepository, User)
        self.register('category', CategoryRepository, Category)
        self.register('interaction', InteractionRepository, JokeInteraction)
    
    def register(
        self,
        name: str,
        repository_class: Type[BaseRepository],
        model_class: Type[Any]
    ) -> None:
        """
        Register a repository class.
        
        Args:
            name: Repository name/identifier
            repository_class: Repository class to register
            model_class: Associated model class
        """
        self._repositories[name] = {
            'class': repository_class,
            'model': model_class
        }
        logger.debug(f"Registered repository: {name} -> {repository_class.__name__}")
    
    def unregister(self, name: str) -> None:
        """
        Unregister a repository.
        
        Args:
            name: Repository name to unregister
        """
        if name in self._repositories:
            del self._repositories[name]
            
        if name in self._instances:
            del self._instances[name]
            
        logger.debug(f"Unregistered repository: {name}")
    
    def get_repository_info(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a registered repository.
        
        Args:
            name: Repository name
            
        Returns:
            Repository information or None if not found
        """
        return self._repositories.get(name)
    
    def list_repositories(self) -> Dict[str, Dict[str, Any]]:
        """Get list of all registered repositories."""
        return self._repositories.copy()
    
    def create_instance(
        self,
        name: str,
        session: AsyncSession,
        cache_instance: bool = True
    ) -> BaseRepository:
        """
        Create repository instance.
        
        Args:
            name: Repository name
            session: Database session
            cache_instance: Whether to cache the instance
            
        Returns:
            Repository instance
            
        Raises:
            ValueError: If repository is not registered
        """
        if name not in self._repositories:
            raise ValueError(f"Repository '{name}' is not registered")
        
        # Check if we have a cached instance for this session
        cache_key = f"{name}_{id(session)}"
        if cache_instance and cache_key in self._instances:
            return self._instances[cache_key]
        
        repo_info = self._repositories[name]
        repository_class = repo_info['class']
        
        # Create instance
        instance = repository_class(session)
        
        if cache_instance:
            self._instances[cache_key] = instance
            self._sessions[cache_key] = session
        
        logger.debug(f"Created repository instance: {name}")
        return instance
    
    def clear_cache(self, session: Optional[AsyncSession] = None) -> None:
        """
        Clear cached repository instances.
        
        Args:
            session: If provided, only clear instances for this session
        """
        if session is None:
            # Clear all cached instances
            self._instances.clear()
            self._sessions.clear()
            logger.debug("Cleared all cached repository instances")
        else:
            # Clear instances for specific session
            session_id = id(session)
            keys_to_remove = [
                key for key, sess in self._sessions.items()
                if id(sess) == session_id
            ]
            
            for key in keys_to_remove:
                self._instances.pop(key, None)
                self._sessions.pop(key, None)
            
            logger.debug(f"Cleared cached instances for session {session_id}")


class RepositoryFactory:
    """Factory for creating and managing repositories with advanced features."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.registry = RepositoryRegistry()
        self._transaction_repositories: Dict[str, BaseRepository] = {}
        self._in_transaction = False
    
    # Repository Creation Methods
    
    def get_joke_repository(self) -> JokeRepository:
        """Get joke repository instance."""
        return self.registry.create_instance('joke', self.session)
    
    def get_user_repository(self) -> UserRepository:
        """Get user repository instance."""
        return self.registry.create_instance('user', self.session)
    
    def get_category_repository(self) -> CategoryRepository:
        """Get category repository instance."""
        return self.registry.create_instance('category', self.session)
    
    def get_interaction_repository(self) -> InteractionRepository:
        """Get interaction repository instance."""
        return self.registry.create_instance('interaction', self.session)
    
    def get_repository(self, name: str) -> BaseRepository:
        """
        Get repository by name.
        
        Args:
            name: Repository name
            
        Returns:
            Repository instance
        """
        return self.registry.create_instance(name, self.session)
    
    # Batch Operations
    
    async def execute_in_repositories(
        self,
        operations: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Execute operations across multiple repositories in a single transaction.
        
        Args:
            operations: Dictionary of repository operations
                Format: {
                    'repository_name': {
                        'method': 'method_name',
                        'args': [],
                        'kwargs': {}
                    }
                }
        
        Returns:
            Dictionary with results from each operation
        """
        results = {}
        
        try:
            async with self.transaction():
                for repo_name, operation in operations.items():
                    repo = self.get_repository(repo_name)
                    method_name = operation.get('method')
                    args = operation.get('args', [])
                    kwargs = operation.get('kwargs', {})
                    
                    if not hasattr(repo, method_name):
                        raise AttributeError(f"Repository '{repo_name}' has no method '{method_name}'")
                    
                    method = getattr(repo, method_name)
                    result = await method(*args, **kwargs)
                    results[repo_name] = result
            
            return results
            
        except Exception as e:
            logger.error(f"Error executing batch operations: {str(e)}")
            raise
    
    # Transaction Management
    
    @asynccontextmanager
    async def transaction(self):
        """Context manager for explicit transaction control across repositories."""
        if self._in_transaction:
            # Already in transaction, just yield
            yield self
            return
        
        self._in_transaction = True
        try:
            # Store current repositories for transaction
            self._transaction_repositories = {}
            
            yield self
            
            # Commit the session
            await self.session.commit()
            
        except Exception:
            # Rollback on error
            await self.session.rollback()
            raise
        finally:
            self._in_transaction = False
            self._transaction_repositories.clear()
    
    # Advanced Repository Features
    
    async def get_cross_repository_stats(self) -> Dict[str, Any]:
        """Get statistics across all repositories."""
        try:
            joke_repo = self.get_joke_repository()
            user_repo = self.get_user_repository()
            category_repo = self.get_category_repository()
            interaction_repo = self.get_interaction_repository()
            
            # Gather statistics concurrently
            results = await asyncio.gather(
                joke_repo.count(),
                user_repo.count(),
                category_repo.count(),
                interaction_repo.count(),
                return_exceptions=True
            )
            
            stats = {
                'total_jokes': results[0] if not isinstance(results[0], Exception) else 0,
                'total_users': results[1] if not isinstance(results[1], Exception) else 0,
                'total_categories': results[2] if not isinstance(results[2], Exception) else 0,
                'total_interactions': results[3] if not isinstance(results[3], Exception) else 0,
                'errors': [r for r in results if isinstance(r, Exception)]
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting cross-repository stats: {str(e)}")
            raise
    
    async def health_check(self) -> Dict[str, Any]:
        """Perform health check across all repositories."""
        health_status = {
            'overall_healthy': True,
            'repositories': {},
            'session_info': {
                'is_active': self.session.is_active,
                'in_transaction': self.session.in_transaction(),
                'connection_invalidated': self.session.get_bind().invalidated if hasattr(self.session.get_bind(), 'invalidated') else False
            }
        }
        
        # Test each repository
        for repo_name in self.registry.list_repositories().keys():
            try:
                repo = self.get_repository(repo_name)
                # Try a simple count operation
                count = await repo.count()
                health_status['repositories'][repo_name] = {
                    'healthy': True,
                    'record_count': count
                }
            except Exception as e:
                health_status['repositories'][repo_name] = {
                    'healthy': False,
                    'error': str(e)
                }
                health_status['overall_healthy'] = False
        
        return health_status
    
    # Utility Methods
    
    def get_repository_list(self) -> List[str]:
        """Get list of available repository names."""
        return list(self.registry.list_repositories().keys())
    
    def clear_cache(self):
        """Clear all cached repository instances."""
        self.registry.clear_cache(self.session)
    
    async def close(self):
        """Clean up resources."""
        self.clear_cache()
        if hasattr(self.session, 'close'):
            await self.session.close()


class RepositoryManager:
    """High-level manager for repository lifecycle and coordination."""
    
    def __init__(self):
        self._factories: Dict[str, RepositoryFactory] = {}
        self._global_registry = RepositoryRegistry()
    
    def create_factory(
        self,
        session: AsyncSession,
        factory_id: Optional[str] = None
    ) -> RepositoryFactory:
        """
        Create a new repository factory.
        
        Args:
            session: Database session
            factory_id: Optional factory identifier
            
        Returns:
            Repository factory instance
        """
        if factory_id is None:
            factory_id = f"factory_{id(session)}"
        
        factory = RepositoryFactory(session)
        # Share the global registry
        factory.registry = self._global_registry
        
        self._factories[factory_id] = factory
        return factory
    
    def get_factory(self, factory_id: str) -> Optional[RepositoryFactory]:
        """Get existing factory by ID."""
        return self._factories.get(factory_id)
    
    def remove_factory(self, factory_id: str) -> None:
        """Remove and clean up a factory."""
        if factory_id in self._factories:
            factory = self._factories[factory_id]
            factory.clear_cache()
            del self._factories[factory_id]
    
    async def cleanup_all(self):
        """Clean up all factories and resources."""
        for factory_id in list(self._factories.keys()):
            factory = self._factories[factory_id]
            await factory.close()
            del self._factories[factory_id]
    
    def register_global_repository(
        self,
        name: str,
        repository_class: Type[BaseRepository],
        model_class: Type[Any]
    ) -> None:
        """Register a repository globally across all factories."""
        self._global_registry.register(name, repository_class, model_class)
    
    def get_global_stats(self) -> Dict[str, Any]:
        """Get statistics about all managed factories."""
        return {
            'total_factories': len(self._factories),
            'factory_ids': list(self._factories.keys()),
            'registered_repositories': list(self._global_registry.list_repositories().keys())
        }


# Convenience functions and decorators

def with_repositories(*repo_names):
    """
    Decorator to inject repositories into a function.
    
    Args:
        *repo_names: Names of repositories to inject
    """
    def decorator(func):
        async def wrapper(session: AsyncSession, *args, **kwargs):
            factory = RepositoryFactory(session)
            
            # Inject repositories as keyword arguments
            for repo_name in repo_names:
                kwargs[f"{repo_name}_repo"] = factory.get_repository(repo_name)
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


@lru_cache(maxsize=1)
def get_repository_manager() -> RepositoryManager:
    """Get singleton repository manager instance."""
    return RepositoryManager()


# Factory function for common use cases
async def create_repository_factory(session: AsyncSession) -> RepositoryFactory:
    """
    Create a repository factory with health check.
    
    Args:
        session: Database session
        
    Returns:
        Repository factory instance
        
    Raises:
        RuntimeError: If health check fails
    """
    factory = RepositoryFactory(session)
    
    # Perform health check
    health = await factory.health_check()
    if not health['overall_healthy']:
        unhealthy_repos = [
            name for name, status in health['repositories'].items()
            if not status['healthy']
        ]
        raise RuntimeError(f"Repository health check failed for: {unhealthy_repos}")
    
    return factory


# Export commonly used objects
__all__ = [
    'RepositoryFactory',
    'RepositoryRegistry',
    'RepositoryManager',
    'with_repositories',
    'get_repository_manager',
    'create_repository_factory'
]