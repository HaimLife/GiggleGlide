from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from typing import Dict, Any, Optional
import random
from datetime import datetime

from models.joke import (
    JokeRequest, JokeResponse, FeedbackRequest, FeedbackResponse,
    HistoryRequest, HistoryResponse, JokeHistoryItem, UserStatsResponse
)
from models.auth import DeviceInfo
from utils.auth import get_current_device
from middleware.rate_limit import jokes_limit, feedback_limit
from services.personalization_service import PersonalizationService
from services.cache_service import get_cache_service
from database.repositories.personalization_repository import PersonalizationRepository
from database.repositories.tag_repository import TagRepository
from database.repositories.joke_repository import JokeRepository
from database.session import get_session

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


# Dependency to get personalization service
async def get_personalization_service(session=Depends(get_session)) -> PersonalizationService:
    """Get personalization service instance."""
    from services.ai_joke_service import AIJokeService
    
    personalization_repo = PersonalizationRepository(session)
    tag_repo = TagRepository(session)
    joke_repo = JokeRepository(session)
    
    # Initialize AI service if API key is configured
    ai_joke_service = None
    try:
        from config import settings
        if settings.OPENAI_API_KEY:
            ai_joke_service = AIJokeService(joke_repo, tag_repo)
    except:
        pass
    
    return PersonalizationService(
        personalization_repo=personalization_repo,
        tag_repo=tag_repo,
        joke_repo=joke_repo,
        ai_joke_service=ai_joke_service
    )

@router.post("/next-joke", response_model=JokeResponse)
@jokes_limit
async def get_next_joke(
    request: Request,
    joke_request: JokeRequest,
    use_personalization: bool = Query(default=True, description="Use personalized recommendations"),
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Get the next joke for the user, with optional personalized recommendations.
    """
    device_id = device["device_id"]
    
    # Try personalized recommendations first if enabled
    if use_personalization:
        try:
            result = await personalization_service.get_personalized_recommendations(
                user_id=device_id,
                limit=1,
                language=joke_request.language,
                exclude_seen=True
            )
            
            if result.jokes:
                joke_obj, score, strategy = result.jokes[0]
                
                # Convert to response format and add personalization metadata
                joke_response = JokeResponse(
                    id=joke_obj.id,
                    text=joke_obj.text,
                    language=joke_obj.language,
                    created_at=joke_obj.created_at or datetime.now(),
                    creator="system"
                )
                
                # Add personalization metadata to response
                joke_response.recommendation_score = score
                joke_response.strategy = strategy
                joke_response.personalized = True
                
                return joke_response
                
        except Exception as e:
            # Log error but continue with fallback
            import logging
            logging.warning(f"Personalization failed for user {device_id}: {str(e)}")
    
    # Fallback to original random selection
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
    
    # Create response with fallback indicators
    joke_response = JokeResponse(**joke)
    joke_response.personalized = False
    joke_response.strategy = "random"
    
    return joke_response

@router.post("/feedback", response_model=FeedbackResponse)
@feedback_limit
async def submit_feedback(
    request: Request,
    feedback: FeedbackRequest,
    update_preferences: bool = Query(default=True, description="Update user preferences based on feedback"),
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Submit feedback for a joke and optionally update user preferences.
    """
    device_id = device["device_id"]
    
    # Verify joke exists
    joke_exists = any(joke["id"] == feedback.joke_id for joke in jokes_db)
    if not joke_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Joke not found"
        )
    
    # Store feedback in memory (legacy)
    if device_id not in feedback_db:
        feedback_db[device_id] = {}
    
    feedback_db[device_id][feedback.joke_id] = {
        "sentiment": feedback.sentiment,
        "timestamp": datetime.now()
    }
    
    # Update personalization preferences if enabled
    tags_updated = 0
    if update_preferences:
        try:
            # Map sentiment to interaction type
            interaction_type_map = {
                "like": "like",
                "dislike": "skip", 
                "neutral": "view"
            }
            
            interaction_type = interaction_type_map.get(feedback.sentiment, "view")
            
            result = await personalization_service.update_user_preferences(
                user_id=device_id,
                joke_id=str(feedback.joke_id),
                interaction_type=interaction_type
            )
            
            tags_updated = result.get("tags_updated", 0)
            
        except Exception as e:
            # Log error but don't fail the feedback submission
            import logging
            logging.warning(f"Failed to update preferences for user {device_id}: {str(e)}")
    
    response_message = f"Feedback recorded for joke {feedback.joke_id}"
    if tags_updated > 0:
        response_message += f" and {tags_updated} preference tags updated"
    
    return FeedbackResponse(
        success=True,
        message=response_message
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