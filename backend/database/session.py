from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import logging
import time
from datetime import datetime, timedelta

from config import settings

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self):
        self.engine = None
        self.session_factory = None
        self._health_check_failures = 0
        self._circuit_breaker_open = False
        self._circuit_breaker_reset_time = None
        
    async def initialize(self):
        """Initialize database engine and session factory"""
        try:
            # Create async engine with connection pooling
            self.engine = create_async_engine(
                settings.DATABASE_URL,
                pool_size=20,
                max_overflow=30,
                pool_timeout=30,
                pool_recycle=3600,  # 1 hour
                pool_pre_ping=True,
                echo=settings.DEBUG,  # Query logging in development
                poolclass=StaticPool if "sqlite" in settings.DATABASE_URL else None
            )
            
            # Create async session factory
            self.session_factory = async_sessionmaker(
                bind=self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=True,
                autocommit=False
            )
            
            logger.info("Database engine initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get database session with proper cleanup"""
        if not self.session_factory:
            raise RuntimeError("Database not initialized")
            
        # Check circuit breaker
        if self._circuit_breaker_open:
            if (self._circuit_breaker_reset_time and 
                datetime.now() > self._circuit_breaker_reset_time):
                self._circuit_breaker_open = False
                self._health_check_failures = 0
                logger.info("Circuit breaker reset")
            else:
                raise RuntimeError("Database circuit breaker is open")
        
        session = None
        try:
            session = self.session_factory()
            yield session
            await session.commit()
        except Exception as e:
            if session:
                await session.rollback()
            self._handle_error(e)
            raise
        finally:
            if session:
                await session.close()
    
    def _handle_error(self, error: Exception):
        """Handle database errors and circuit breaker logic"""
        self._health_check_failures += 1
        logger.error(f"Database error: {error}")
        
        # Open circuit breaker if too many failures
        if self._health_check_failures >= 5:
            self._circuit_breaker_open = True
            self._circuit_breaker_reset_time = datetime.now() + timedelta(minutes=1)
            logger.warning("Circuit breaker opened due to repeated failures")
    
    async def health_check(self) -> dict:
        """Check database health"""
        try:
            start_time = time.time()
            
            async with self.get_session() as session:
                # Simple query to test connection
                result = await session.execute("SELECT 1")
                result.fetchone()
            
            response_time = time.time() - start_time
            
            # Reset failure counter on successful health check
            self._health_check_failures = 0
            
            return {
                "status": "healthy",
                "response_time_ms": round(response_time * 1000, 2),
                "pool_size": self.engine.pool.size() if self.engine else 0,
                "checked_out": self.engine.pool.checkedout() if self.engine else 0,
                "overflow": self.engine.pool.overflow() if self.engine else 0,
                "circuit_breaker": "closed" if not self._circuit_breaker_open else "open"
            }
            
        except Exception as e:
            self._handle_error(e)
            return {
                "status": "unhealthy",
                "error": str(e),
                "failures": self._health_check_failures,
                "circuit_breaker": "open" if self._circuit_breaker_open else "closed"
            }
    
    async def close(self):
        """Close database connections"""
        if self.engine:
            await self.engine.dispose()
            logger.info("Database connections closed")

# Global database manager instance
db_manager = DatabaseManager()

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions"""
    async with db_manager.get_session() as session:
        yield session

@asynccontextmanager
async def get_db_transaction() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for database transactions"""
    async with db_manager.get_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise