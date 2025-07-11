from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Application settings
    APP_NAME: str = "GiggleGlide API"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:19006",
        "http://localhost:8081",
        "exp://localhost:19000",
        "http://localhost:3000"
    ]
    
    # Rate limiting
    RATE_LIMIT_JOKES: str = "100/hour"
    RATE_LIMIT_FEEDBACK: str = "10/hour"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./giggleglide.db")
    
    # Redis Cache
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # OpenAI Configuration
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    OPENAI_MAX_TOKENS: int = 200
    OPENAI_TEMPERATURE: float = 0.8
    
    # AI Generation Settings
    AI_JOKE_BATCH_SIZE: int = 10
    AI_JOKE_CACHE_SIZE: int = 100
    AI_GENERATION_COOLDOWN_MINUTES: int = 5
    
    # Cost Control Settings
    AI_MONTHLY_BUDGET_USD: float = 100.0
    AI_MAX_COST_PER_REQUEST: float = 0.10
    AI_COST_TRACKING_ENABLED: bool = True
    
    # Moderation Settings
    MODERATION_ENABLED: bool = True
    MODERATION_THRESHOLD_VIOLENCE: float = 0.7
    MODERATION_THRESHOLD_HATE: float = 0.5
    MODERATION_THRESHOLD_SELF_HARM: float = 0.7
    MODERATION_THRESHOLD_SEXUAL: float = 0.7
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

settings = Settings()