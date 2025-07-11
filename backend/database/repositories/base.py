"""Base repository class with generic CRUD operations."""

from abc import ABC, abstractmethod
from typing import TypeVar, Generic, List, Optional, Dict, Any, Union, Type, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import select, update, delete, func, and_, or_, text
from sqlalchemy.exc import IntegrityError, NoResultFound, SQLAlchemyError
from datetime import datetime, timedelta
import logging
import asyncio
from contextlib import asynccontextmanager
import uuid

# Type variable for model types
ModelType = TypeVar('ModelType')
CreateSchemaType = TypeVar('CreateSchemaType')
UpdateSchemaType = TypeVar('UpdateSchemaType')

logger = logging.getLogger(__name__)


class RepositoryError(Exception):
    """Base repository exception."""
    pass


class ValidationError(RepositoryError):
    """Validation error in repository operations."""
    pass


class NotFoundError(RepositoryError):
    """Entity not found error."""
    pass


class ConcurrencyError(RepositoryError):
    """Concurrency control error."""
    pass


class BaseRepository(Generic[ModelType, CreateSchemaType, UpdateSchemaType], ABC):
    """
    Base repository class providing generic CRUD operations with async support.
    
    Features:
    - Generic CRUD operations
    - Bulk operations
    - Query optimization with eager loading
    - Error handling and logging
    - Pagination support
    - Transaction management
    - Concurrency control
    """

    def __init__(self, model: Type[ModelType], session: AsyncSession):
        """
        Initialize repository with model and session.
        
        Args:
            model: SQLAlchemy model class
            session: Async database session
        """
        self.model = model
        self.session = session
        self._default_relationships: List[str] = []
        self._cache_enabled = False
        self._cache_ttl = timedelta(minutes=5)
        self._cache: Dict[str, Tuple[Any, datetime]] = {}

    # CRUD Operations

    async def create(
        self,
        obj_in: Union[CreateSchemaType, Dict[str, Any]],
        commit: bool = True,
        **kwargs
    ) -> ModelType:
        """
        Create a new entity.
        
        Args:
            obj_in: Creation schema or dictionary
            commit: Whether to commit the transaction
            **kwargs: Additional fields to set
            
        Returns:
            Created entity
            
        Raises:
            ValidationError: If validation fails
            RepositoryError: If creation fails
        """
        try:
            # Convert to dict if needed
            if hasattr(obj_in, 'dict'):
                obj_data = obj_in.dict(exclude_unset=True)
            elif isinstance(obj_in, dict):
                obj_data = obj_in.copy()
            else:
                obj_data = obj_in

            # Add any additional kwargs
            obj_data.update(kwargs)

            # Validate data before creation
            await self._validate_create(obj_data)

            # Create model instance
            db_obj = self.model(**obj_data)
            
            self.session.add(db_obj)
            
            if commit:
                await self.session.commit()
                await self.session.refresh(db_obj)
            else:
                await self.session.flush()
                await self.session.refresh(db_obj)

            logger.debug(f"Created {self.model.__name__} with id: {getattr(db_obj, 'id', 'N/A')}")
            return db_obj

        except IntegrityError as e:
            await self.session.rollback()
            logger.error(f"Integrity error creating {self.model.__name__}: {str(e)}")
            raise ValidationError(f"Data integrity violation: {str(e)}")
        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error creating {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to create {self.model.__name__}: {str(e)}")

    async def get(
        self,
        id: Any,
        relationships: Optional[List[str]] = None,
        raise_not_found: bool = True
    ) -> Optional[ModelType]:
        """
        Get entity by ID.
        
        Args:
            id: Entity ID
            relationships: Related entities to load
            raise_not_found: Whether to raise exception if not found
            
        Returns:
            Entity or None
            
        Raises:
            NotFoundError: If entity not found and raise_not_found is True
        """
        try:
            # Check cache first
            cache_key = f"{self.model.__name__}:{id}"
            if self._cache_enabled and cache_key in self._cache:
                cached_obj, cached_time = self._cache[cache_key]
                if datetime.now() - cached_time < self._cache_ttl:
                    return cached_obj

            # Build query with relationships
            query = select(self.model).where(self.model.id == id)
            
            # Add eager loading for relationships
            relationships = relationships or self._default_relationships
            for rel in relationships:
                if hasattr(self.model, rel):
                    query = query.options(selectinload(getattr(self.model, rel)))

            result = await self.session.execute(query)
            obj = result.scalar_one_or_none()

            if obj is None and raise_not_found:
                raise NotFoundError(f"{self.model.__name__} with id {id} not found")

            # Cache the result
            if self._cache_enabled and obj:
                self._cache[cache_key] = (obj, datetime.now())

            return obj

        except NoResultFound:
            if raise_not_found:
                raise NotFoundError(f"{self.model.__name__} with id {id} not found")
            return None
        except Exception as e:
            logger.error(f"Error getting {self.model.__name__} with id {id}: {str(e)}")
            raise RepositoryError(f"Failed to get {self.model.__name__}: {str(e)}")

    async def get_multi(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        filters: Optional[Dict[str, Any]] = None,
        order_by: Optional[str] = None,
        order_desc: bool = False,
        relationships: Optional[List[str]] = None
    ) -> List[ModelType]:
        """
        Get multiple entities with pagination and filtering.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            filters: Filter conditions
            order_by: Field to order by
            order_desc: Whether to order descending
            relationships: Related entities to load
            
        Returns:
            List of entities
        """
        try:
            query = select(self.model)

            # Apply filters
            if filters:
                query = self._apply_filters(query, filters)

            # Apply ordering
            if order_by and hasattr(self.model, order_by):
                order_field = getattr(self.model, order_by)
                if order_desc:
                    query = query.order_by(order_field.desc())
                else:
                    query = query.order_by(order_field)

            # Add eager loading for relationships
            relationships = relationships or self._default_relationships
            for rel in relationships:
                if hasattr(self.model, rel):
                    query = query.options(selectinload(getattr(self.model, rel)))

            # Apply pagination
            query = query.offset(skip).limit(limit)

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error getting multiple {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to get multiple {self.model.__name__}: {str(e)}")

    async def update(
        self,
        id: Any,
        obj_in: Union[UpdateSchemaType, Dict[str, Any]],
        commit: bool = True
    ) -> ModelType:
        """
        Update an entity.
        
        Args:
            id: Entity ID
            obj_in: Update schema or dictionary
            commit: Whether to commit the transaction
            
        Returns:
            Updated entity
            
        Raises:
            NotFoundError: If entity not found
            ValidationError: If validation fails
        """
        try:
            # Get existing entity
            db_obj = await self.get(id)
            if not db_obj:
                raise NotFoundError(f"{self.model.__name__} with id {id} not found")

            # Convert to dict if needed
            if hasattr(obj_in, 'dict'):
                update_data = obj_in.dict(exclude_unset=True)
            elif isinstance(obj_in, dict):
                update_data = obj_in.copy()
            else:
                update_data = obj_in

            # Validate update data
            await self._validate_update(db_obj, update_data)

            # Update fields
            for field, value in update_data.items():
                if hasattr(db_obj, field):
                    setattr(db_obj, field, value)

            # Update timestamp if available
            if hasattr(db_obj, 'updated_at'):
                db_obj.updated_at = datetime.utcnow()

            if commit:
                await self.session.commit()
                await self.session.refresh(db_obj)
            else:
                await self.session.flush()
                await self.session.refresh(db_obj)

            # Invalidate cache
            if self._cache_enabled:
                cache_key = f"{self.model.__name__}:{id}"
                self._cache.pop(cache_key, None)

            logger.debug(f"Updated {self.model.__name__} with id: {id}")
            return db_obj

        except NotFoundError:
            raise
        except IntegrityError as e:
            await self.session.rollback()
            logger.error(f"Integrity error updating {self.model.__name__}: {str(e)}")
            raise ValidationError(f"Data integrity violation: {str(e)}")
        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error updating {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to update {self.model.__name__}: {str(e)}")

    async def delete(self, id: Any, commit: bool = True) -> bool:
        """
        Delete an entity.
        
        Args:
            id: Entity ID
            commit: Whether to commit the transaction
            
        Returns:
            True if deleted, False if not found
        """
        try:
            # Get existing entity
            db_obj = await self.get(id, raise_not_found=False)
            if not db_obj:
                return False

            await self.session.delete(db_obj)

            if commit:
                await self.session.commit()

            # Invalidate cache
            if self._cache_enabled:
                cache_key = f"{self.model.__name__}:{id}"
                self._cache.pop(cache_key, None)

            logger.debug(f"Deleted {self.model.__name__} with id: {id}")
            return True

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error deleting {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to delete {self.model.__name__}: {str(e)}")

    # Bulk Operations

    async def bulk_create(
        self,
        objs_in: List[Union[CreateSchemaType, Dict[str, Any]]],
        commit: bool = True,
        batch_size: int = 1000
    ) -> List[ModelType]:
        """
        Bulk create entities.
        
        Args:
            objs_in: List of creation schemas or dictionaries
            commit: Whether to commit the transaction
            batch_size: Number of entities to process in each batch
            
        Returns:
            List of created entities
        """
        try:
            created_objs = []

            # Process in batches
            for i in range(0, len(objs_in), batch_size):
                batch = objs_in[i:i + batch_size]
                batch_objs = []

                for obj_in in batch:
                    # Convert to dict if needed
                    if hasattr(obj_in, 'dict'):
                        obj_data = obj_in.dict(exclude_unset=True)
                    elif isinstance(obj_in, dict):
                        obj_data = obj_in.copy()
                    else:
                        obj_data = obj_in

                    # Validate data
                    await self._validate_create(obj_data)

                    # Create model instance
                    db_obj = self.model(**obj_data)
                    batch_objs.append(db_obj)

                self.session.add_all(batch_objs)
                await self.session.flush()

                # Refresh all objects in batch
                for obj in batch_objs:
                    await self.session.refresh(obj)

                created_objs.extend(batch_objs)

            if commit:
                await self.session.commit()

            logger.info(f"Bulk created {len(created_objs)} {self.model.__name__} entities")
            return created_objs

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error bulk creating {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to bulk create {self.model.__name__}: {str(e)}")

    async def bulk_update(
        self,
        updates: List[Dict[str, Any]],
        commit: bool = True
    ) -> int:
        """
        Bulk update entities.
        
        Args:
            updates: List of update dictionaries with 'id' and update fields
            commit: Whether to commit the transaction
            
        Returns:
            Number of updated entities
        """
        try:
            if not updates:
                return 0

            updated_count = 0

            for update_data in updates:
                if 'id' not in update_data:
                    continue

                entity_id = update_data.pop('id')
                
                # Add updated_at if available
                if hasattr(self.model, 'updated_at'):
                    update_data['updated_at'] = datetime.utcnow()

                query = (
                    update(self.model)
                    .where(self.model.id == entity_id)
                    .values(**update_data)
                )

                result = await self.session.execute(query)
                updated_count += result.rowcount

            if commit:
                await self.session.commit()

            logger.info(f"Bulk updated {updated_count} {self.model.__name__} entities")
            return updated_count

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error bulk updating {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to bulk update {self.model.__name__}: {str(e)}")

    async def bulk_delete(
        self,
        ids: List[Any],
        commit: bool = True
    ) -> int:
        """
        Bulk delete entities.
        
        Args:
            ids: List of entity IDs
            commit: Whether to commit the transaction
            
        Returns:
            Number of deleted entities
        """
        try:
            if not ids:
                return 0

            query = delete(self.model).where(self.model.id.in_(ids))
            result = await self.session.execute(query)
            deleted_count = result.rowcount

            if commit:
                await self.session.commit()

            logger.info(f"Bulk deleted {deleted_count} {self.model.__name__} entities")
            return deleted_count

        except Exception as e:
            await self.session.rollback()
            logger.error(f"Error bulk deleting {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to bulk delete {self.model.__name__}: {str(e)}")

    # Query Operations

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Count entities with optional filters.
        
        Args:
            filters: Filter conditions
            
        Returns:
            Number of entities
        """
        try:
            query = select(func.count(self.model.id))

            if filters:
                query = self._apply_filters(query, filters)

            result = await self.session.execute(query)
            return result.scalar()

        except Exception as e:
            logger.error(f"Error counting {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to count {self.model.__name__}: {str(e)}")

    async def exists(self, id: Any) -> bool:
        """
        Check if entity exists.
        
        Args:
            id: Entity ID
            
        Returns:
            True if exists, False otherwise
        """
        try:
            query = select(func.count(self.model.id)).where(self.model.id == id)
            result = await self.session.execute(query)
            return result.scalar() > 0

        except Exception as e:
            logger.error(f"Error checking existence of {self.model.__name__}: {str(e)}")
            raise RepositoryError(f"Failed to check existence: {str(e)}")

    async def find_by(
        self,
        **filters
    ) -> List[ModelType]:
        """
        Find entities by field values.
        
        Args:
            **filters: Field name and value pairs
            
        Returns:
            List of matching entities
        """
        try:
            query = select(self.model)

            for field, value in filters.items():
                if hasattr(self.model, field):
                    query = query.where(getattr(self.model, field) == value)

            result = await self.session.execute(query)
            return result.scalars().all()

        except Exception as e:
            logger.error(f"Error finding {self.model.__name__} by filters: {str(e)}")
            raise RepositoryError(f"Failed to find by filters: {str(e)}")

    async def find_one_by(
        self,
        raise_not_found: bool = False,
        **filters
    ) -> Optional[ModelType]:
        """
        Find one entity by field values.
        
        Args:
            raise_not_found: Whether to raise exception if not found
            **filters: Field name and value pairs
            
        Returns:
            Matching entity or None
        """
        try:
            entities = await self.find_by(**filters)
            
            if not entities:
                if raise_not_found:
                    raise NotFoundError(f"{self.model.__name__} not found with filters: {filters}")
                return None
            
            return entities[0]

        except Exception as e:
            logger.error(f"Error finding one {self.model.__name__} by filters: {str(e)}")
            raise RepositoryError(f"Failed to find one by filters: {str(e)}")

    # Helper Methods

    def _apply_filters(self, query, filters: Dict[str, Any]):
        """Apply filter conditions to query."""
        for field, value in filters.items():
            if hasattr(self.model, field):
                if isinstance(value, list):
                    query = query.where(getattr(self.model, field).in_(value))
                elif isinstance(value, dict):
                    # Handle range queries, etc.
                    for op, val in value.items():
                        if op == 'gte':
                            query = query.where(getattr(self.model, field) >= val)
                        elif op == 'lte':
                            query = query.where(getattr(self.model, field) <= val)
                        elif op == 'gt':
                            query = query.where(getattr(self.model, field) > val)
                        elif op == 'lt':
                            query = query.where(getattr(self.model, field) < val)
                        elif op == 'like':
                            query = query.where(getattr(self.model, field).like(f"%{val}%"))
                        elif op == 'ilike':
                            query = query.where(getattr(self.model, field).ilike(f"%{val}%"))
                else:
                    query = query.where(getattr(self.model, field) == value)
        return query

    async def _validate_create(self, obj_data: Dict[str, Any]) -> None:
        """Validate data before creation. Override in subclasses."""
        pass

    async def _validate_update(self, db_obj: ModelType, update_data: Dict[str, Any]) -> None:
        """Validate data before update. Override in subclasses."""
        pass

    # Cache Management

    def enable_cache(self, ttl_minutes: int = 5):
        """Enable caching with specified TTL."""
        self._cache_enabled = True
        self._cache_ttl = timedelta(minutes=ttl_minutes)

    def disable_cache(self):
        """Disable caching."""
        self._cache_enabled = False
        self._cache.clear()

    def clear_cache(self):
        """Clear all cached data."""
        self._cache.clear()

    # Transaction Management

    @asynccontextmanager
    async def transaction(self):
        """Context manager for explicit transaction control."""
        try:
            yield self.session
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    # Abstract Methods for Subclasses

    @abstractmethod
    async def get_specialized_query(self, **kwargs):
        """Implement specialized queries in subclasses."""
        pass