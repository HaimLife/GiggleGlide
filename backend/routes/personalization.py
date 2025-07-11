"""API routes for personalized joke recommendations and user preference management."""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from typing import Dict, Any, List, Optional
from datetime import datetime

from ..models.joke import JokeResponse
from ..models.auth import DeviceInfo
from ..utils.auth import get_current_device
from ..middleware.rate_limit import jokes_limit, feedback_limit
from ..services.personalization_service import PersonalizationService, RecommendationConfig
from ..services.cache_service import get_cache_service
from ..database.repositories.personalization_repository import PersonalizationRepository
from ..database.repositories.tag_repository import TagRepository
from ..database.repositories.joke_repository import JokeRepository
from ..database.repositories.user_repository import UserRepository
from ..database.session import get_session
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/personalized", tags=["Personalization"])


# Pydantic Models

class PersonalizedJokeRequest(BaseModel):
    """Request model for personalized jokes."""
    language: str = Field(default="en", description="Language preference")
    limit: int = Field(default=10, ge=1, le=50, description="Number of jokes to return")
    exploration_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Exploration rate for ε-greedy algorithm")
    use_collaborative: bool = Field(default=True, description="Whether to use collaborative filtering")
    exclude_seen: bool = Field(default=True, description="Whether to exclude previously seen jokes")


class PersonalizedJokeResponse(BaseModel):
    """Response model for personalized jokes."""
    jokes: List[Dict[str, Any]]
    strategy_breakdown: Dict[str, int]
    performance_metrics: Dict[str, float]
    total_recommendations: int
    cache_hit: bool


class InteractionFeedback(BaseModel):
    """Model for user interaction feedback."""
    joke_id: str = Field(..., description="ID of the joke")
    interaction_type: str = Field(..., description="Type of interaction (like, skip, view)")
    feedback_strength: float = Field(default=1.0, ge=0.0, le=1.0, description="Strength of the feedback signal")


class PreferenceAnalysisResponse(BaseModel):
    """Response model for user preference analysis."""
    user_id: str
    preferences_by_category: Dict[str, List[Dict[str, Any]]]
    top_preferences: List[Dict[str, Any]]
    diversity_score: float
    performance_metrics: Dict[str, Any]
    total_tag_scores: int
    positive_preferences: int


class RecommendationExplanation(BaseModel):
    """Model for recommendation explanation."""
    joke_id: str
    total_match_score: float
    top_matches: List[Dict[str, Any]]
    recommendation_strength: float


class UserPreferenceInit(BaseModel):
    """Model for initializing user preferences."""
    preferences: Dict[str, List[str]] = Field(..., description="Initial preferences by category")


# Dependency functions

async def get_personalization_service(session=Depends(get_session)) -> PersonalizationService:
    """Get personalization service instance."""
    personalization_repo = PersonalizationRepository(session)
    tag_repo = TagRepository(session)
    joke_repo = JokeRepository(session)
    
    return PersonalizationService(
        personalization_repo=personalization_repo,
        tag_repo=tag_repo,
        joke_repo=joke_repo
    )


# API Endpoints

@router.post("/recommendations", response_model=PersonalizedJokeResponse)
@jokes_limit
async def get_personalized_recommendations(
    request: Request,
    joke_request: PersonalizedJokeRequest,
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Get personalized joke recommendations using ε-greedy algorithm.
    """
    try:
        device_id = device["device_id"]
        cache_service = get_cache_service()
        
        # Check cache first
        context = {
            "language": joke_request.language,
            "limit": joke_request.limit,
            "exploration_rate": joke_request.exploration_rate,
            "use_collaborative": joke_request.use_collaborative,
            "exclude_seen": joke_request.exclude_seen
        }
        
        cached_result = await cache_service.get_cached_recommendations(device_id, context)
        if cached_result:
            return PersonalizedJokeResponse(
                jokes=cached_result["jokes"],
                strategy_breakdown=cached_result["strategy_breakdown"],
                performance_metrics=cached_result["performance_metrics"],
                total_recommendations=len(cached_result["jokes"]),
                cache_hit=True
            )
        
        # Get fresh recommendations
        if joke_request.exploration_rate is not None:
            # Create custom config with specified exploration rate
            config = RecommendationConfig(exploration_rate=joke_request.exploration_rate)
            personalization_service.config = config
        
        result = await personalization_service.get_personalized_recommendations(
            user_id=device_id,
            limit=joke_request.limit,
            language=joke_request.language,
            exclude_seen=joke_request.exclude_seen,
            use_collaborative=joke_request.use_collaborative
        )
        
        # Convert jokes to response format
        joke_data = []
        for joke, score, strategy in result.jokes:
            joke_data.append({
                "id": joke.id,
                "text": joke.text,
                "category": joke.category,
                "language": joke.language,
                "rating": joke.rating,
                "view_count": joke.view_count,
                "like_count": joke.like_count,
                "created_at": joke.created_at.isoformat() if joke.created_at else None,
                "recommendation_score": score,
                "strategy": strategy
            })
        
        response = PersonalizedJokeResponse(
            jokes=joke_data,
            strategy_breakdown=result.strategy_breakdown,
            performance_metrics=result.performance_metrics,
            total_recommendations=len(joke_data),
            cache_hit=result.cache_hit
        )
        
        # Cache the result
        await cache_service.cache_recommendations(device_id, result, context)
        
        return response

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting personalized recommendations: {str(e)}"
        )


@router.post("/feedback")
@feedback_limit
async def submit_interaction_feedback(
    request: Request,
    feedback: InteractionFeedback,
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Submit user interaction feedback to update preferences.
    """
    try:
        device_id = device["device_id"]
        
        # Validate interaction type
        valid_types = ['like', 'skip', 'view', 'favorite', 'share']
        if feedback.interaction_type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid interaction type. Must be one of: {valid_types}"
            )
        
        # Update user preferences
        result = await personalization_service.update_user_preferences(
            user_id=device_id,
            joke_id=feedback.joke_id,
            interaction_type=feedback.interaction_type,
            feedback_strength=feedback.feedback_strength
        )
        
        return {
            "success": True,
            "message": f"Feedback recorded for joke {feedback.joke_id}",
            "tags_updated": result["tags_updated"],
            "updated_at": result["updated_at"]
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error submitting feedback: {str(e)}"
        )


@router.get("/preferences", response_model=PreferenceAnalysisResponse)
async def get_user_preferences(
    request: Request,
    include_trends: bool = Query(False, description="Include preference trends"),
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Get user's preference analysis and behavior patterns.
    """
    try:
        device_id = device["device_id"]
        
        analysis = await personalization_service.analyze_user_preferences(
            user_id=device_id,
            include_trends=include_trends
        )
        
        return PreferenceAnalysisResponse(**analysis)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting user preferences: {str(e)}"
        )


@router.get("/explanation/{joke_id}", response_model=RecommendationExplanation)
async def get_recommendation_explanation(
    joke_id: str,
    request: Request,
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Get explanation for why a specific joke was recommended.
    """
    try:
        device_id = device["device_id"]
        
        explanation = await personalization_service.get_recommendation_explanation(
            user_id=device_id,
            joke_id=joke_id
        )
        
        if not explanation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Explanation not available for this joke"
            )
        
        return RecommendationExplanation(**explanation)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting recommendation explanation: {str(e)}"
        )


@router.post("/cold-start")
async def handle_cold_start(
    request: Request,
    preference_init: UserPreferenceInit,
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Initialize preferences for new users (cold start handling).
    """
    try:
        device_id = device["device_id"]
        
        result = await personalization_service.handle_cold_start_user(
            user_id=device_id,
            initial_preferences=preference_init.preferences
        )
        
        # Convert to response format
        joke_data = []
        for joke, score, strategy in result.jokes:
            joke_data.append({
                "id": joke.id,
                "text": joke.text,
                "category": joke.category,
                "language": joke.language,
                "rating": joke.rating,
                "recommendation_score": score,
                "strategy": strategy
            })
        
        return {
            "success": True,
            "message": "Cold start preferences initialized",
            "initial_recommendations": joke_data,
            "strategy_breakdown": result.strategy_breakdown
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error handling cold start: {str(e)}"
        )


@router.get("/tags")
async def get_available_tags(
    request: Request,
    category: Optional[str] = Query(None, description="Filter by tag category"),
    session=Depends(get_session)
):
    """
    Get available tags for preference initialization.
    """
    try:
        tag_repo = TagRepository(session)
        cache_service = get_cache_service()
        
        # Check cache first
        cached_tags = await cache_service.get_cached_tags(category)
        if cached_tags:
            return {"tags": cached_tags, "cache_hit": True}
        
        # Get from database
        if category:
            tags = await tag_repo.get_tags_by_category(category)
        else:
            tags = await tag_repo.get_all()
        
        # Convert to response format
        tag_data = []
        for tag in tags:
            tag_data.append({
                "id": tag.id,
                "name": tag.name,
                "category": tag.category,
                "value": tag.value,
                "description": tag.description
            })
        
        # Cache the result
        await cache_service.cache_tags(tags, category)
        
        return {"tags": tag_data, "cache_hit": False}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting tags: {str(e)}"
        )


@router.get("/trending")
async def get_trending_jokes(
    request: Request,
    language: str = Query("en", description="Language preference"),
    limit: int = Query(10, ge=1, le=50, description="Number of jokes to return"),
    time_window_hours: int = Query(24, ge=1, le=168, description="Time window for trending calculation"),
    session=Depends(get_session)
):
    """
    Get trending jokes (popular in recent time window).
    """
    try:
        joke_repo = JokeRepository(session)
        cache_service = get_cache_service()
        
        # Check cache for hot jokes
        cache_key = f"trending_{language}_{time_window_hours}"
        cached_joke_ids = await cache_service.get_hot_jokes(cache_key)
        
        if cached_joke_ids:
            # Get full joke data for cached IDs
            jokes = []
            for joke_id in cached_joke_ids[:limit]:
                joke = await joke_repo.get(joke_id)
                if joke:
                    jokes.append(joke)
        else:
            # Get fresh trending jokes
            jokes = await joke_repo.get_trending_jokes(
                language=language,
                time_window_hours=time_window_hours,
                limit=limit
            )
            
            # Cache the joke IDs
            joke_ids = [joke.id for joke in jokes]
            await cache_service.cache_hot_jokes(joke_ids, cache_key)
        
        # Convert to response format
        joke_data = []
        for joke in jokes:
            joke_data.append({
                "id": joke.id,
                "text": joke.text,
                "category": joke.category,
                "language": joke.language,
                "rating": joke.rating,
                "view_count": joke.view_count,
                "like_count": joke.like_count,
                "created_at": joke.created_at.isoformat() if joke.created_at else None
            })
        
        return {
            "jokes": joke_data,
            "total": len(joke_data),
            "language": language,
            "time_window_hours": time_window_hours,
            "cache_hit": bool(cached_joke_ids)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting trending jokes: {str(e)}"
        )


@router.get("/metrics")
async def get_personalization_metrics(
    request: Request,
    days: int = Query(30, ge=1, le=90, description="Number of days to analyze"),
    device: DeviceInfo = Depends(get_current_device),
    personalization_service: PersonalizationService = Depends(get_personalization_service)
):
    """
    Get personalization performance metrics for the user.
    """
    try:
        device_id = device["device_id"]
        
        metrics = await personalization_service.personalization_repo.get_recommendation_performance(
            user_id=device_id,
            days=days
        )
        
        return {
            "user_id": device_id,
            "analysis_period_days": days,
            "metrics": metrics,
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting personalization metrics: {str(e)}"
        )


@router.delete("/cache")
async def clear_user_cache(
    request: Request,
    device: DeviceInfo = Depends(get_current_device)
):
    """
    Clear cached data for the user (useful for testing or privacy).
    """
    try:
        device_id = device["device_id"]
        cache_service = get_cache_service()
        
        success = await cache_service.invalidate_user_cache(device_id)
        
        return {
            "success": success,
            "message": f"Cache cleared for user {device_id}",
            "cleared_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error clearing cache: {str(e)}"
        )