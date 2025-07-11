import pytest
import asyncio
import time
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from database.session import DatabaseManager, get_db_session, get_db_transaction

class TestDatabaseManager:
    
    @pytest.fixture
    def db_manager(self):
        return DatabaseManager()
    
    @pytest.fixture
    async def initialized_db_manager(self):
        manager = DatabaseManager()
        # Mock the engine and session factory
        manager.engine = AsyncMock()
        manager.engine.pool.size.return_value = 10
        manager.engine.pool.checkedout.return_value = 2
        manager.engine.pool.overflow.return_value = 0
        
        session_mock = AsyncMock(spec=AsyncSession)
        manager.session_factory = MagicMock(return_value=session_mock)
        
        return manager
    
    @pytest.mark.asyncio
    async def test_initialization(self, db_manager):
        """Test database manager initialization"""
        with patch('database.session.create_async_engine') as mock_engine, \
             patch('database.session.async_sessionmaker') as mock_sessionmaker:
            
            mock_engine.return_value = AsyncMock()
            mock_sessionmaker.return_value = AsyncMock()
            
            await db_manager.initialize()
            
            assert db_manager.engine is not None
            assert db_manager.session_factory is not None
            mock_engine.assert_called_once()
            mock_sessionmaker.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_session_success(self, initialized_db_manager):
        """Test successful session retrieval"""
        async with initialized_db_manager.get_session() as session:
            assert session is not None
            # Verify session methods are available
            assert hasattr(session, 'commit')
            assert hasattr(session, 'rollback')
            assert hasattr(session, 'close')
    
    @pytest.mark.asyncio
    async def test_get_session_error_handling(self, initialized_db_manager):
        """Test session error handling and rollback"""
        session_mock = initialized_db_manager.session_factory()
        session_mock.commit.side_effect = Exception("Database error")
        
        with pytest.raises(Exception):
            async with initialized_db_manager.get_session() as session:
                # This should trigger the error
                pass
        
        # Verify rollback was called
        session_mock.rollback.assert_called_once()
        session_mock.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_mechanism(self, initialized_db_manager):
        """Test circuit breaker opens after repeated failures"""
        # Simulate repeated failures
        for _ in range(5):
            initialized_db_manager._handle_error(Exception("Test error"))
        
        assert initialized_db_manager._circuit_breaker_open
        assert initialized_db_manager._health_check_failures == 5
        
        # Test that circuit breaker prevents new sessions
        with pytest.raises(RuntimeError, match="Circuit breaker is open"):
            async with initialized_db_manager.get_session():
                pass
    
    @pytest.mark.asyncio
    async def test_health_check_healthy(self, initialized_db_manager):
        """Test health check when database is healthy"""
        session_mock = initialized_db_manager.session_factory()
        session_mock.execute.return_value = AsyncMock()
        
        health = await initialized_db_manager.health_check()
        
        assert health["status"] == "healthy"
        assert "response_time_ms" in health
        assert "pool_size" in health
        assert health["circuit_breaker"] == "closed"
    
    @pytest.mark.asyncio
    async def test_health_check_unhealthy(self, initialized_db_manager):
        """Test health check when database is unhealthy"""
        session_mock = initialized_db_manager.session_factory()
        session_mock.execute.side_effect = Exception("Connection failed")
        
        health = await initialized_db_manager.health_check()
        
        assert health["status"] == "unhealthy"
        assert "error" in health
        assert health["failures"] > 0
    
    @pytest.mark.asyncio
    async def test_connection_pooling_under_load(self, initialized_db_manager):
        """Test connection pooling under concurrent load"""
        async def concurrent_session():
            async with initialized_db_manager.get_session() as session:
                await asyncio.sleep(0.01)  # Simulate work
                return session
        
        # Create 50 concurrent sessions
        tasks = [concurrent_session() for _ in range(50)]
        sessions = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verify all sessions were created successfully
        successful_sessions = [s for s in sessions if not isinstance(s, Exception)]
        assert len(successful_sessions) == 50
    
    @pytest.mark.asyncio
    async def test_transaction_context_manager(self, initialized_db_manager):
        """Test transaction context manager"""
        session_mock = initialized_db_manager.session_factory()
        
        async with get_db_transaction() as session:
            # Simulate some work
            await session.execute("SELECT 1")
        
        # Verify commit was called
        session_mock.commit.assert_called()
    
    @pytest.mark.asyncio
    async def test_transaction_rollback_on_error(self, initialized_db_manager):
        """Test transaction rollback on error"""
        session_mock = initialized_db_manager.session_factory()
        
        with pytest.raises(Exception):
            async with get_db_transaction() as session:
                raise Exception("Transaction error")
        
        # Verify rollback was called
        session_mock.rollback.assert_called()
    
    @pytest.mark.asyncio
    async def test_fastapi_dependency_injection(self, initialized_db_manager):
        """Test FastAPI dependency injection"""
        async for session in get_db_session():
            assert session is not None
            assert isinstance(session, type(initialized_db_manager.session_factory()))
            break  # Only test one iteration
    
    def test_error_handling_increments_failures(self, db_manager):
        """Test error handling increments failure counter"""
        initial_failures = db_manager._health_check_failures
        
        db_manager._handle_error(Exception("Test error"))
        
        assert db_manager._health_check_failures == initial_failures + 1
    
    @pytest.mark.asyncio
    async def test_performance_metrics(self, initialized_db_manager):
        """Test performance metrics collection"""
        start_time = time.time()
        
        health = await initialized_db_manager.health_check()
        
        end_time = time.time()
        
        assert health["response_time_ms"] > 0
        assert health["response_time_ms"] < (end_time - start_time) * 1000 + 100  # Allow some margin
    
    @pytest.mark.asyncio
    async def test_cleanup_and_close(self, initialized_db_manager):
        """Test proper cleanup when closing"""
        await initialized_db_manager.close()
        
        # Verify engine dispose was called
        initialized_db_manager.engine.dispose.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_session_not_initialized_error(self, db_manager):
        """Test error when trying to get session before initialization"""
        with pytest.raises(RuntimeError, match="Database not initialized"):
            async with db_manager.get_session():
                pass