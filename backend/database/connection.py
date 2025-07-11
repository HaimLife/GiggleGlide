import os
import time
import asyncio
from typing import Optional, Generator, AsyncGenerator
from contextlib import contextmanager, asynccontextmanager
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import sessionmaker, Session, scoped_session
from sqlalchemy.pool import NullPool, QueuePool
from sqlalchemy.exc import OperationalError, DatabaseError, DisconnectionError
import logging
from dotenv import load_dotenv
from dataclasses import dataclass
from enum import Enum

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Circuit breaker states
class CircuitBreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    recovery_timeout: int = 60
    expected_exception: tuple = (OperationalError, DatabaseError, DisconnectionError)

class CircuitBreaker:
    """Circuit breaker pattern implementation for database connections"""
    
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitBreakerState.CLOSED
    
    def call(self, func, *args, **kwargs):
        if self.state == CircuitBreakerState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitBreakerState.HALF_OPEN
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except self.config.expected_exception as e:
            self._on_failure()
            raise e
    
    async def async_call(self, func, *args, **kwargs):
        if self.state == CircuitBreakerState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitBreakerState.HALF_OPEN
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except self.config.expected_exception as e:
            self._on_failure()
            raise e
    
    def _should_attempt_reset(self):
        return (
            self.last_failure_time and
            time.time() - self.last_failure_time >= self.config.recovery_timeout
        )
    
    def _on_success(self):
        self.failure_count = 0
        self.state = CircuitBreakerState.CLOSED
    
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.config.failure_threshold:
            self.state = CircuitBreakerState.OPEN

# Database configuration
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/giggleglide'
)

# Parse database URL for async connection
ASYNC_DATABASE_URL = DATABASE_URL
if DATABASE_URL.startswith('postgresql://'):
    ASYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')

# Parse database URL for sync connection 
SYNC_DATABASE_URL = DATABASE_URL
if DATABASE_URL.startswith('postgresql://'):
    SYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg2://')

# Environment configuration
IS_PRODUCTION = os.getenv('ENV', 'development').lower() == 'production'
ENABLE_QUERY_LOGGING = os.getenv('ENABLE_QUERY_LOGGING', 'true').lower() == 'true'

# Connection pool settings
POOL_SIZE = int(os.getenv('DB_POOL_SIZE', '10'))
MAX_OVERFLOW = int(os.getenv('DB_MAX_OVERFLOW', '20'))
POOL_TIMEOUT = int(os.getenv('DB_POOL_TIMEOUT', '30'))
POOL_RECYCLE = int(os.getenv('DB_POOL_RECYCLE', '3600'))

# Connection retry settings
MAX_RETRY_ATTEMPTS = int(os.getenv('DB_MAX_RETRY_ATTEMPTS', '3'))
RETRY_DELAY = float(os.getenv('DB_RETRY_DELAY', '1.0'))

# Circuit breaker configuration
circuit_breaker_config = CircuitBreakerConfig(
    failure_threshold=int(os.getenv('DB_CIRCUIT_BREAKER_THRESHOLD', '5')),
    recovery_timeout=int(os.getenv('DB_CIRCUIT_BREAKER_TIMEOUT', '60'))
)
circuit_breaker = CircuitBreaker(circuit_breaker_config)

# Metrics storage
class DatabaseMetrics:
    def __init__(self):
        self.connection_attempts = 0
        self.connection_failures = 0
        self.active_connections = 0
        self.query_count = 0
        self.slow_query_count = 0
        self.transaction_rollbacks = 0
        self.circuit_breaker_trips = 0
        
    def reset(self):
        self.__init__()

db_metrics = DatabaseMetrics()

# Create async engine with optimized settings
async_engine_kwargs = {
    'pool_size': POOL_SIZE,
    'max_overflow': MAX_OVERFLOW,
    'pool_timeout': POOL_TIMEOUT,
    'pool_recycle': POOL_RECYCLE,
    'pool_pre_ping': True,
    'echo': ENABLE_QUERY_LOGGING and not IS_PRODUCTION,
}

if IS_PRODUCTION:
    async_engine_kwargs.update({
        'connect_args': {
            'server_settings': {
                'statement_timeout': '30000',  # 30 second statement timeout
                'idle_in_transaction_session_timeout': '300000'  # 5 minute idle timeout
            }
        }
    })

async_engine = create_async_engine(ASYNC_DATABASE_URL, **async_engine_kwargs)

# Create sync engine for backwards compatibility
sync_engine_kwargs = {
    'pool_size': POOL_SIZE,
    'max_overflow': MAX_OVERFLOW,
    'pool_timeout': POOL_TIMEOUT,
    'pool_recycle': POOL_RECYCLE,
    'pool_pre_ping': True,
    'echo': ENABLE_QUERY_LOGGING and not IS_PRODUCTION,
}

if IS_PRODUCTION:
    sync_engine_kwargs.update({
        'connect_args': {
            'connect_timeout': 10,
            'options': '-c statement_timeout=30000'
        }
    })

sync_engine = create_engine(SYNC_DATABASE_URL, **sync_engine_kwargs)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Create sync session factory for backwards compatibility
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine,
    expire_on_commit=False
)

# Create scoped session for thread safety
ScopedSession = scoped_session(SessionLocal)

# Connection retry decorator
def retry_db_operation(max_attempts=MAX_RETRY_ATTEMPTS, delay=RETRY_DELAY):
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_attempts):
                try:
                    db_metrics.connection_attempts += 1
                    return await circuit_breaker.async_call(func, *args, **kwargs)
                except (OperationalError, DatabaseError, DisconnectionError) as e:
                    last_exception = e
                    db_metrics.connection_failures += 1
                    if attempt < max_attempts - 1:
                        logger.warning(f"Database operation failed (attempt {attempt + 1}/{max_attempts}): {str(e)}")
                        await asyncio.sleep(delay * (2 ** attempt))  # Exponential backoff
                    else:
                        logger.error(f"Database operation failed after {max_attempts} attempts: {str(e)}")
                except Exception as e:
                    if circuit_breaker.state == CircuitBreakerState.OPEN:
                        db_metrics.circuit_breaker_trips += 1
                    raise e
            raise last_exception
        
        def sync_wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_attempts):
                try:
                    db_metrics.connection_attempts += 1
                    return circuit_breaker.call(func, *args, **kwargs)
                except (OperationalError, DatabaseError, DisconnectionError) as e:
                    last_exception = e
                    db_metrics.connection_failures += 1
                    if attempt < max_attempts - 1:
                        logger.warning(f"Database operation failed (attempt {attempt + 1}/{max_attempts}): {str(e)}")
                        time.sleep(delay * (2 ** attempt))  # Exponential backoff
                    else:
                        logger.error(f"Database operation failed after {max_attempts} attempts: {str(e)}")
                except Exception as e:
                    if circuit_breaker.state == CircuitBreakerState.OPEN:
                        db_metrics.circuit_breaker_trips += 1
                    raise e
            raise last_exception
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    return decorator

# Event listeners for query monitoring and metrics
@event.listens_for(async_engine.sync_engine, "before_cursor_execute")
def before_cursor_execute_async(conn, cursor, statement, parameters, context, executemany):
    """Log query start time for async operations"""
    conn.info.setdefault('query_start_time', []).append(time.time())
    db_metrics.query_count += 1

@event.listens_for(async_engine.sync_engine, "after_cursor_execute")
def after_cursor_execute_async(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries for async operations"""
    start_time = conn.info['query_start_time'].pop(-1)
    total_time = time.time() - start_time
    if total_time > 1.0:  # Log queries taking more than 1 second
        db_metrics.slow_query_count += 1
        logger.warning(f"Slow async query detected ({total_time:.2f}s): {statement[:100]}...")

@event.listens_for(sync_engine, "before_cursor_execute")
def before_cursor_execute_sync(conn, cursor, statement, parameters, context, executemany):
    """Log query start time for sync operations"""
    conn.info.setdefault('query_start_time', []).append(time.time())
    db_metrics.query_count += 1

@event.listens_for(sync_engine, "after_cursor_execute")
def after_cursor_execute_sync(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries for sync operations"""
    start_time = conn.info['query_start_time'].pop(-1)
    total_time = time.time() - start_time
    if total_time > 1.0:  # Log queries taking more than 1 second
        db_metrics.slow_query_count += 1
        logger.warning(f"Slow sync query detected ({total_time:.2f}s): {statement[:100]}...")

@event.listens_for(sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Set SQLite pragmas for better performance (if using SQLite for testing)"""
    if 'sqlite' in SYNC_DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# Async database session management
async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Async dependency to get database session for FastAPI routes.
    Use with FastAPI's Depends() function.
    """
    async with get_async_db_session() as session:
        try:
            db_metrics.active_connections += 1
            yield session
        finally:
            db_metrics.active_connections -= 1

@asynccontextmanager
async def get_async_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager for database sessions"""
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception as e:
        logger.error(f"Async database transaction error: {str(e)}")
        db_metrics.transaction_rollbacks += 1
        await session.rollback()
        raise
    finally:
        await session.close()

# Sync database session management (backwards compatibility)
def get_db() -> Generator[Session, None, None]:
    """
    Sync dependency to get database session.
    Use with FastAPI's Depends() or in other contexts.
    """
    db = SessionLocal()
    try:
        db_metrics.active_connections += 1
        yield db
    except Exception as e:
        logger.error(f"Sync database session error: {str(e)}")
        db_metrics.transaction_rollbacks += 1
        db.rollback()
        raise
    finally:
        db_metrics.active_connections -= 1
        db.close()

@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Sync context manager for database sessions"""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception as e:
        logger.error(f"Sync database transaction error: {str(e)}")
        db_metrics.transaction_rollbacks += 1
        session.rollback()
        raise
    finally:
        session.close()

# Health check functions
@retry_db_operation()
async def test_async_connection() -> bool:
    """Test async database connection"""
    try:
        async with async_engine.begin() as conn:
            result = await conn.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception as e:
        logger.error(f"Async database connection test failed: {str(e)}")
        return False

@retry_db_operation()
def test_connection() -> bool:
    """Test sync database connection"""
    try:
        with sync_engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception as e:
        logger.error(f"Sync database connection test failed: {str(e)}")
        return False

# Database statistics and monitoring
def get_async_db_stats() -> dict:
    """Get async database connection pool statistics"""
    pool = async_engine.pool
    return {
        'engine_type': 'async',
        'size': pool.size() if hasattr(pool, 'size') else 'N/A',
        'checked_in': pool.checkedin() if hasattr(pool, 'checkedin') else 'N/A',
        'checked_out': pool.checkedout() if hasattr(pool, 'checkedout') else 'N/A',
        'overflow': pool.overflow() if hasattr(pool, 'overflow') else 'N/A',
        'total': pool.size() + pool.overflow() if hasattr(pool, 'size') and hasattr(pool, 'overflow') else 'N/A',
        'invalid': pool.invalidated() if hasattr(pool, 'invalidated') else 'N/A'
    }

def get_sync_db_stats() -> dict:
    """Get sync database connection pool statistics"""
    pool = sync_engine.pool
    return {
        'engine_type': 'sync',
        'size': pool.size() if hasattr(pool, 'size') else 'N/A',
        'checked_in': pool.checkedin() if hasattr(pool, 'checkedin') else 'N/A',
        'checked_out': pool.checkedout() if hasattr(pool, 'checkedout') else 'N/A',
        'overflow': pool.overflow() if hasattr(pool, 'overflow') else 'N/A',
        'total': pool.size() + pool.overflow() if hasattr(pool, 'size') and hasattr(pool, 'overflow') else 'N/A',
        'invalid': pool.invalidated() if hasattr(pool, 'invalidated') else 'N/A'
    }

def get_db_metrics() -> dict:
    """Get comprehensive database metrics"""
    return {
        'connection_attempts': db_metrics.connection_attempts,
        'connection_failures': db_metrics.connection_failures,
        'active_connections': db_metrics.active_connections,
        'query_count': db_metrics.query_count,
        'slow_query_count': db_metrics.slow_query_count,
        'transaction_rollbacks': db_metrics.transaction_rollbacks,
        'circuit_breaker_trips': db_metrics.circuit_breaker_trips,
        'circuit_breaker_state': circuit_breaker.state.value,
        'failure_rate': (db_metrics.connection_failures / max(db_metrics.connection_attempts, 1)) * 100
    }

async def get_comprehensive_db_health() -> dict:
    """Get comprehensive database health information"""
    async_conn_test = await test_async_connection()
    sync_conn_test = test_connection()
    
    return {
        'async_connection_healthy': async_conn_test,
        'sync_connection_healthy': sync_conn_test,
        'overall_healthy': async_conn_test and sync_conn_test,
        'async_pool_stats': get_async_db_stats(),
        'sync_pool_stats': get_sync_db_stats(),
        'metrics': get_db_metrics(),
        'circuit_breaker_state': circuit_breaker.state.value
    }

# Database initialization
async def init_async_db():
    """Initialize database tables using async engine"""
    from .models import Base
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created successfully (async)")
    except Exception as e:
        logger.error(f"Failed to create database tables (async): {str(e)}")
        raise

def init_db():
    """Initialize database tables using sync engine"""
    from .models import Base
    try:
        Base.metadata.create_all(bind=sync_engine)
        logger.info("Database tables created successfully (sync)")
    except Exception as e:
        logger.error(f"Failed to create database tables (sync): {str(e)}")
        raise

async def drop_async_db():
    """Drop all database tables using async engine (use with caution!)"""
    from .models import Base
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.warning("All database tables dropped! (async)")
    except Exception as e:
        logger.error(f"Failed to drop database tables (async): {str(e)}")
        raise

def drop_db():
    """Drop all database tables using sync engine (use with caution!)"""
    from .models import Base
    try:
        Base.metadata.drop_all(bind=sync_engine)
        logger.warning("All database tables dropped! (sync)")
    except Exception as e:
        logger.error(f"Failed to drop database tables (sync): {str(e)}")
        raise

# Utility functions for common operations
async def execute_async_query(query: str, params: Optional[dict] = None) -> list:
    """Execute a raw SQL query asynchronously and return results"""
    async with get_async_db_session() as session:
        result = await session.execute(text(query), params or {})
        return result.fetchall()

def execute_query(query: str, params: Optional[dict] = None) -> list:
    """Execute a raw SQL query synchronously and return results"""
    with get_db_session() as session:
        result = session.execute(text(query), params or {})
        return result.fetchall()

async def bulk_insert_async(model_class, data: list) -> int:
    """Bulk insert data into a table asynchronously"""
    async with get_async_db_session() as session:
        try:
            session.add_all([model_class(**item) for item in data])
            await session.commit()
            return len(data)
        except Exception as e:
            logger.error(f"Async bulk insert failed: {str(e)}")
            await session.rollback()
            raise

def bulk_insert(model_class, data: list) -> int:
    """Bulk insert data into a table synchronously"""
    with get_db_session() as session:
        try:
            session.bulk_insert_mappings(model_class, data)
            session.commit()
            return len(data)
        except Exception as e:
            logger.error(f"Sync bulk insert failed: {str(e)}")
            session.rollback()
            raise

# Cleanup functions
async def cleanup_async_connections():
    """Clean up async database connections"""
    try:
        await async_engine.dispose()
        logger.info("Async database connections cleaned up")
    except Exception as e:
        logger.error(f"Error cleaning up async database connections: {str(e)}")

def cleanup_connections():
    """Clean up sync database connections"""
    try:
        sync_engine.dispose()
        logger.info("Sync database connections cleaned up")
    except Exception as e:
        logger.error(f"Error cleaning up sync database connections: {str(e)}")

# Export commonly used objects
__all__ = [
    # Engines
    'async_engine',
    'sync_engine',
    # Session factories
    'AsyncSessionLocal',
    'SessionLocal',
    'ScopedSession',
    # Dependency injection functions
    'get_async_db',
    'get_db',
    # Context managers
    'get_async_db_session',
    'get_db_session',
    # Health checks
    'test_async_connection',
    'test_connection',
    'get_comprehensive_db_health',
    # Statistics and monitoring
    'get_async_db_stats',
    'get_sync_db_stats',
    'get_db_metrics',
    # Database initialization
    'init_async_db',
    'init_db',
    'drop_async_db',
    'drop_db',
    # Utility functions
    'execute_async_query',
    'execute_query',
    'bulk_insert_async',
    'bulk_insert',
    # Cleanup
    'cleanup_async_connections',
    'cleanup_connections',
    # Metrics
    'db_metrics',
    'DatabaseMetrics',
    # Circuit breaker
    'circuit_breaker',
    'CircuitBreaker',
    'CircuitBreakerState'
]