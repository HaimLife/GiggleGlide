from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from routes import auth, jokes
from middleware.rate_limit import limiter, create_rate_limit_exceeded_handler
from middleware.error_handler import (
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler
)
from utils.logging import setup_logging, get_logger, log_request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

# Setup logging
setup_logging()
logger = get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up GiggleGlide API...")
    yield
    logger.info("Shutting down GiggleGlide API...")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )