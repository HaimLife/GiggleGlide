from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class JokeRequest(BaseModel):
    language: Optional[str] = Field(default="en", description="Language code for jokes")
    exclude_flagged: bool = Field(default=True, description="Exclude flagged jokes")

class JokeResponse(BaseModel):
    id: int
    text: str
    language: str
    created_at: datetime
    creator: Optional[str] = None
    # Personalization fields
    personalized: Optional[bool] = Field(default=None, description="Whether this joke was personalized")
    recommendation_score: Optional[float] = Field(default=None, description="Recommendation confidence score")
    strategy: Optional[str] = Field(default=None, description="Recommendation strategy used")

class FeedbackRequest(BaseModel):
    joke_id: int = Field(..., description="ID of the joke")
    sentiment: Literal["like", "neutral", "dislike"] = Field(..., description="User's reaction to the joke")

class FeedbackResponse(BaseModel):
    success: bool
    message: str

class HistoryRequest(BaseModel):
    limit: int = Field(default=50, ge=1, le=100, description="Number of jokes to return")
    offset: int = Field(default=0, ge=0, description="Offset for pagination")

class JokeHistoryItem(BaseModel):
    id: int
    text: str
    language: str
    created_at: datetime
    sentiment: Optional[Literal["like", "neutral", "dislike"]] = None
    feedback_date: Optional[datetime] = None
    is_favorite: bool = False

class HistoryResponse(BaseModel):
    jokes: list[JokeHistoryItem]
    total: int
    limit: int
    offset: int

class UserStatsResponse(BaseModel):
    total_seen: int
    liked: int
    disliked: int
    neutral: int
    favorites: int