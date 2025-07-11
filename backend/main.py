from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from routes import auth, jokes, health
from middleware.rate_limit import limiter, create_rate_limit_exceeded_handler
from database.session import db_manager
from middleware.error_handler import (
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler
)
from utils.logging import setup_logging, get_logger, log_request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from database.connection import (
    get_comprehensive_db_health,
    get_async_db_stats,
    get_sync_db_stats,
    get_db_metrics,
    cleanup_async_connections,
    cleanup_connections
)

# Setup logging
setup_logging()
logger = get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up GiggleGlide API...")
    
    # Initialize new database manager
    try:
        await db_manager.initialize()
        logger.info("Database manager initialized successfully")
        
        # Check health
        health = await db_manager.health_check()
        if health["status"] == "healthy":
            logger.info("Database is healthy")
        else:
            logger.warning(f"Database health check failed: {health}")
    except Exception as e:
        logger.error(f"Failed to initialize database manager: {str(e)}")
    
    # Legacy database cleanup for compatibility
    try:
        health = await get_comprehensive_db_health()
        if health['overall_healthy']:
            logger.info("Legacy database connections are healthy")
        else:
            logger.warning("Legacy database connection issues detected")
    except Exception as e:
        logger.error(f"Failed to check legacy database health: {str(e)}")
    
    yield
    
    # Cleanup database connections on shutdown
    logger.info("Shutting down GiggleGlide API...")
    try:
        await db_manager.close()
        await cleanup_async_connections()
        cleanup_connections()
        logger.info("All database connections cleaned up successfully")
    except Exception as e:
        logger.error(f"Error during database cleanup: {str(e)}")

app = FastAPI(
    title="GiggleGlide API",
    description="Backend API for GiggleGlide joke app",
    version="1.0.0",
    lifespan=lifespan
)

# Add rate limiter to app state
app.state.limiter = limiter

# Add exception handlers
app.add_exception_handler(RateLimitExceeded, create_rate_limit_exceeded_handler())
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request logging middleware
app.add_middleware(BaseHTTPMiddleware, dispatch=log_request)

# Include routers
app.include_router(auth.router)
app.include_router(jokes.router)
app.include_router(health.router)

@app.get("/")
async def root():
    return {"message": "Welcome to GiggleGlide API"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "GiggleGlide API",
        "version": "1.0.0"
    }

@app.get("/health/database")
async def database_health_check():
    """Comprehensive database health check endpoint"""
    try:
        health_data = await get_comprehensive_db_health()
        status_code = 200 if health_data['overall_healthy'] else 503
        
        return {
            "status": "healthy" if health_data['overall_healthy'] else "unhealthy",
            "timestamp": health_data,
            **health_data
        }
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "async_connection_healthy": False,
            "sync_connection_healthy": False,
            "overall_healthy": False
        }

@app.get("/health/database/stats")
async def database_stats():
    """Get detailed database connection pool statistics"""
    try:
        return {
            "async_pool": get_async_db_stats(),
            "sync_pool": get_sync_db_stats(),
            "metrics": get_db_metrics()
        }
    except Exception as e:
        logger.error(f"Failed to get database stats: {str(e)}")
        return {
            "error": str(e),
            "async_pool": {},
            "sync_pool": {},
            "metrics": {}
        }

@app.get("/health/database/metrics")
async def database_metrics():
    """Get database connection metrics and monitoring data"""
    try:
        metrics = get_db_metrics()
        return {
            "status": "healthy",
            "metrics": metrics,
            "recommendations": []
        }
    except Exception as e:
        logger.error(f"Failed to get database metrics: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "metrics": {},
            "recommendations": ["Check database connection configuration"]
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )