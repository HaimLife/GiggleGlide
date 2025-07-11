from pydantic_settings import BaseSettings
from typing import List
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
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

settings = Settings()