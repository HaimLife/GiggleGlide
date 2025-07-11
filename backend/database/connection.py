import os
from typing import Optional, Generator
from contextlib import contextmanager
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session, scoped_session
from sqlalchemy.pool import NullPool, QueuePool
from sqlalchemy.exc import OperationalError, DatabaseError
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/giggleglide'
)

# Parse database URL for connection pooling configuration
if DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg2://')

# Engine configuration based on environment
IS_PRODUCTION = os.getenv('ENV', 'development').lower() == 'production'

# Create engine with appropriate settings
if IS_PRODUCTION:
    # Production settings with connection pooling
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,  # Verify connections before using
        pool_recycle=3600,   # Recycle connections after 1 hour
        echo=False,
        connect_args={
            'connect_timeout': 10,
            'options': '-c statement_timeout=30000'  # 30 second statement timeout
        }
    )
else:
    # Development settings
    engine = create_engine(
        DATABASE_URL,
        echo=True,  # Log SQL statements
        pool_pre_ping=True,
        connect_args={
            'connect_timeout': 10
        }
    )

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False
)

# Create scoped session for thread safety
ScopedSession = scoped_session(SessionLocal)


# Connection event listeners
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Set SQLite pragmas for better performance (if using SQLite for testing)"""
    if 'sqlite' in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries in production"""
    conn.info.setdefault('query_start_time', []).append(os.times())


@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log query execution time for slow queries"""
    total = os.times() - conn.info['query_start_time'].pop(-1)
    if total > 1.0:  # Log queries taking more than 1 second
        logger.warning(f"Slow query detected ({total:.2f}s): {statement[:100]}...")


# Database session management
def get_db() -> Generator[Session, None, None]:
    """
    Dependency to get database session.
    Use with FastAPI's Depends() or in other contexts.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Context manager for database sessions"""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception as e:
        logger.error(f"Database transaction error: {str(e)}")
        session.rollback()
        raise
    finally:
        session.close()


# Connection testing and health check
def test_connection() -> bool:
    """Test database connection"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            return result.scalar() == 1
    except (OperationalError, DatabaseError) as e:
        logger.error(f"Database connection test failed: {str(e)}")
        return False


def get_db_stats() -> dict:
    """Get database connection pool statistics"""
    pool = engine.pool
    return {
        'size': pool.size() if hasattr(pool, 'size') else 'N/A',
        'checked_in': pool.checkedin() if hasattr(pool, 'checkedin') else 'N/A',
        'checked_out': pool.checkedout() if hasattr(pool, 'checkedout') else 'N/A',
        'overflow': pool.overflow() if hasattr(pool, 'overflow') else 'N/A',
        'total': pool.size() + pool.overflow() if hasattr(pool, 'size') and hasattr(pool, 'overflow') else 'N/A'
    }


# Database initialization
def init_db():
    """Initialize database tables"""
    from .models import Base
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {str(e)}")
        raise


def drop_db():
    """Drop all database tables (use with caution!)"""
    from .models import Base
    try:
        Base.metadata.drop_all(bind=engine)
        logger.warning("All database tables dropped!")
    except Exception as e:
        logger.error(f"Failed to drop database tables: {str(e)}")
        raise


# Utility functions for common operations
def execute_query(query: str, params: Optional[dict] = None) -> list:
    """Execute a raw SQL query and return results"""
    with get_db_session() as session:
        result = session.execute(text(query), params or {})
        return result.fetchall()


def bulk_insert(model_class, data: list) -> int:
    """Bulk insert data into a table"""
    with get_db_session() as session:
        try:
            session.bulk_insert_mappings(model_class, data)
            session.commit()
            return len(data)
        except Exception as e:
            logger.error(f"Bulk insert failed: {str(e)}")
            session.rollback()
            raise


# Export commonly used objects
__all__ = [
    'engine',
    'SessionLocal',
    'ScopedSession',
    'get_db',
    'get_db_session',
    'test_connection',
    'get_db_stats',
    'init_db',
    'drop_db',
    'execute_query',
    'bulk_insert'
]