from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Dict, Any
import random
from datetime import datetime

from models.joke import (
    JokeRequest, JokeResponse, FeedbackRequest, FeedbackResponse,
    HistoryRequest, HistoryResponse, JokeHistoryItem, UserStatsResponse
)
from models.auth import DeviceInfo
from utils.auth import get_current_device
from middleware.rate_limit import jokes_limit, feedback_limit

router = APIRouter(prefix="/api", tags=["Jokes"])

# In-memory storage for demo (replace with database in production)
jokes_db = [
    {"id": 1, "text": "Why don't scientists trust atoms? Because they make up everything!", "language": "en", "created_at": datetime.now(), "creator": "system"},
    {"id": 2, "text": "I told my wife she was drawing her eyebrows too high. She looked surprised.", "language": "en", "created_at": datetime.now(), "creator": "system"},
    {"id": 3, "text": "Why did the scarecrow win an award? He was outstanding in his field!", "language": "en", "created_at": datetime.now(), "creator": "system"},
    {"id": 4, "text": "I used to hate facial hair, but then it grew on me.", "language": "en", "created_at": datetime.now(), "creator": "system"},
    {"id": 5, "text": "Why don't eggs tell jokes? They'd crack up!", "language": "en", "created_at": datetime.now(), "creator": "system"},
]

feedback_db: Dict[str, Dict[int, Any]] = {}  # device_id -> joke_id -> feedback
seen_jokes_db: Dict[str, set] = {}  # device_id -> set of joke_ids

@router.post("/next-joke", response_model=JokeResponse)
@jokes_limit
async def get_next_joke(
    request: Request,
    joke_request: JokeRequest,
    device: DeviceInfo = Depends(get_current_device)
):
    """
    Get the next joke for the user, excluding previously seen jokes.
    """
    device_id = device["device_id"]
    
    # Get seen jokes for this device
    seen_jokes = seen_jokes_db.get(device_id, set())
    
    # Filter jokes by language and exclude seen ones
    available_jokes = [
        joke for joke in jokes_db
        if joke["language"] == joke_request.language and joke["id"] not in seen_jokes
    ]
    
    if not available_jokes:
        # Reset if all jokes have been seen
        seen_jokes_db[device_id] = set()
        available_jokes = [joke for joke in jokes_db if joke["language"] == joke_request.language]
    
    if not available_jokes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No jokes available in language: {joke_request.language}"
        )
    
    # Select a random joke
    joke = random.choice(available_jokes)
    
    # Mark as seen
    if device_id not in seen_jokes_db:
        seen_jokes_db[device_id] = set()
    seen_jokes_db[device_id].add(joke["id"])
    
    return JokeResponse(**joke)

@router.post("/feedback", response_model=FeedbackResponse)
@feedback_limit
async def submit_feedback(
    request: Request,
    feedback: FeedbackRequest,
    device: DeviceInfo = Depends(get_current_device)
):
    """
    Submit feedback for a joke.
    """
    device_id = device["device_id"]
    
    # Verify joke exists
    joke_exists = any(joke["id"] == feedback.joke_id for joke in jokes_db)
    if not joke_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Joke not found"
        )
    
    # Store feedback
    if device_id not in feedback_db:
        feedback_db[device_id] = {}
    
    feedback_db[device_id][feedback.joke_id] = {
        "sentiment": feedback.sentiment,
        "timestamp": datetime.now()
    }
    
    return FeedbackResponse(
        success=True,
        message=f"Feedback recorded for joke {feedback.joke_id}"
    )

@router.get("/history", response_model=HistoryResponse)
async def get_joke_history(
    request: Request,
    params: HistoryRequest = Depends(),
    device: DeviceInfo = Depends(get_current_device)
):
    """
    Get the user's joke history with feedback.
    """
    device_id = device["device_id"]
    
    # Get user's feedback
    user_feedback = feedback_db.get(device_id, {})
    
    # Build history
    history_items = []
    for joke_id, feedback_info in user_feedback.items():
        # Find the joke
        joke = next((j for j in jokes_db if j["id"] == joke_id), None)
        if joke:
            history_items.append(JokeHistoryItem(
                id=joke["id"],
                text=joke["text"],
                language=joke["language"],
                created_at=joke["created_at"],
                sentiment=feedback_info["sentiment"],
                feedback_date=feedback_info["timestamp"],
                is_favorite=False  # Implement favorites later
            ))
    
    # Sort by feedback date (newest first)
    history_items.sort(key=lambda x: x.feedback_date or datetime.min, reverse=True)
    
    # Apply pagination
    total = len(history_items)
    paginated_items = history_items[params.offset:params.offset + params.limit]
    
    return HistoryResponse(
        jokes=paginated_items,
        total=total,
        limit=params.limit,
        offset=params.offset
    )

@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    request: Request,
    device: DeviceInfo = Depends(get_current_device)
):
    """
    Get user statistics.
    """
    device_id = device["device_id"]
    
    # Calculate stats
    user_feedback = feedback_db.get(device_id, {})
    seen_jokes = seen_jokes_db.get(device_id, set())
    
    stats = {
        "total_seen": len(seen_jokes),
        "liked": sum(1 for f in user_feedback.values() if f["sentiment"] == "like"),
        "disliked": sum(1 for f in user_feedback.values() if f["sentiment"] == "dislike"),
        "neutral": sum(1 for f in user_feedback.values() if f["sentiment"] == "neutral"),
        "favorites": 0  # Implement favorites later
    }
    
    return UserStatsResponse(**stats)