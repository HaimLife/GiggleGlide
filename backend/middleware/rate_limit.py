from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import logging

from config import settings

logger = logging.getLogger(__name__)

# Create limiter instance
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",  # Use in-memory storage for now
    headers_enabled=True,  # Add rate limit headers to responses
)

def create_rate_limit_exceeded_handler():
    """Create a custom handler for rate limit exceeded errors"""
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
        response = JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded",
                "message": f"Rate limit exceeded: {exc.detail}",
            }
        )
        response.headers["Retry-After"] = str(exc.retry_after) if hasattr(exc, 'retry_after') else "3600"
        return response
    
    return rate_limit_handler

# Rate limit decorators for different endpoints
jokes_limit = limiter.limit(settings.RATE_LIMIT_JOKES)
feedback_limit = limiter.limit(settings.RATE_LIMIT_FEEDBACK)

# Custom rate limiter for authenticated routes
def get_device_id(request: Request) -> str:
    """Extract device ID from JWT token for rate limiting"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        # In production, decode the JWT to get device_id
        # For now, we'll use the token itself as the key
        return auth_header[7:][:32]  # Use first 32 chars of token
    return get_remote_address(request)

# Create device-based limiter
device_limiter = Limiter(
    key_func=get_device_id,
    default_limits=["1000 per day", "100 per hour"],
    storage_uri="memory://",
    headers_enabled=True,
)