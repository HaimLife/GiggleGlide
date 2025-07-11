from fastapi import APIRouter, status
from database.session import db_manager
import logging

router = APIRouter(prefix="/health", tags=["Health Check"])
logger = logging.getLogger(__name__)

@router.get("/")
async def basic_health_check():
    """Basic application health check"""
    return {
        "status": "healthy",
        "service": "GiggleGlide API",
        "version": "1.0.0"
    }

@router.get("/database")
async def database_health_check():
    """Database health check with connection metrics"""
    try:
        health_data = await db_manager.health_check()
        
        if health_data["status"] == "healthy":
            return health_data
        else:
            logger.warning(f"Database health check failed: {health_data}")
            return health_data
            
    except Exception as e:
        logger.error(f"Database health check error: {e}")
        return {
            "status": "error",
            "error": str(e)
        }

@router.get("/detailed")
async def detailed_health_check():
    """Comprehensive health check"""
    try:
        db_health = await db_manager.health_check()
        
        overall_status = "healthy" if db_health["status"] == "healthy" else "degraded"
        
        return {
            "status": overall_status,
            "service": "GiggleGlide API",
            "version": "1.0.0",
            "components": {
                "database": db_health,
                "api": {"status": "healthy"}
            }
        }
        
    except Exception as e:
        logger.error(f"Detailed health check error: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }