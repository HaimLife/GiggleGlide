"""API endpoints for AI joke generation and management."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from ..utils.auth import get_current_device
from ..services.ai_joke_service import AIJokeService, JokeGenerationRequest, GeneratedJoke
from ..database.repositories.joke_repository import JokeRepository
from ..database.repositories.tag_repository import TagRepository
from ..database.session import get_session
from ..models.auth import DeviceInfo

router = APIRouter(prefix="/api/ai", tags=["AI Jokes"])


# Request/Response Models
class GenerateJokesRequest(BaseModel):
    """Request model for joke generation."""
    tags: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Tags by category (style, format, topic, tone)"
    )
    language: str = Field(default="en", description="Language code")
    count: int = Field(default=5, ge=1, le=20, description="Number of jokes to generate")
    temperature: float = Field(default=0.8, ge=0.0, le=1.0, description="Creativity level")


class GenerateJokesResponse(BaseModel):
    """Response model for joke generation."""
    jokes: List[Dict[str, Any]]
    generation_id: str
    total_cost: float
    moderation_results: List[Dict[str, Any]]


class ModerateContentRequest(BaseModel):
    """Request model for content moderation."""
    text: str = Field(..., description="Text to moderate")
    joke_id: Optional[str] = Field(None, description="Optional joke ID")


class ModerateContentResponse(BaseModel):
    """Response model for content moderation."""
    safe: bool
    flagged_categories: List[str]
    scores: Dict[str, float]
    joke_id: Optional[str]


class AIStatusResponse(BaseModel):
    """Response model for AI service status."""
    enabled: bool
    model: str
    cost_summary: Dict[str, Any]
    generation_stats: Dict[str, Any]


# Dependencies
async def get_ai_joke_service(session=Depends(get_session)) -> AIJokeService:
    """Get AI joke service instance."""
    joke_repo = JokeRepository(session)
    tag_repo = TagRepository(session)
    return AIJokeService(joke_repo, tag_repo)


# Endpoints
@router.post("/generate", response_model=GenerateJokesResponse)
async def generate_jokes(
    request: GenerateJokesRequest,
    device: DeviceInfo = Depends(get_current_device),
    ai_service: AIJokeService = Depends(get_ai_joke_service)
):
    """
    Generate new jokes using AI based on specified tags and preferences.
    
    This endpoint allows manual joke generation for testing or on-demand needs.
    Generated jokes are automatically moderated and stored if safe.
    """
    try:
        # Create generation request
        gen_request = JokeGenerationRequest(
            tags=request.tags,
            language=request.language,
            count=request.count,
            user_id=device["device_id"],
            temperature=request.temperature
        )
        
        # Generate jokes
        generated_jokes = await ai_service.generate_jokes(gen_request)
        
        # Moderate all jokes
        jokes_response = []
        moderation_results = []
        total_cost = 0.0
        
        for joke in generated_jokes:
            # Moderate content
            moderation = await ai_service.moderate_content(joke.text)
            
            moderation_results.append({
                "safe": moderation.safe,
                "flagged_categories": moderation.flagged_categories,
                "scores": moderation.scores
            })
            
            # Only include safe jokes
            if moderation.safe:
                jokes_response.append({
                    "text": joke.text,
                    "tags": joke.tags,
                    "language": joke.language,
                    "confidence": joke.confidence,
                    "model": joke.model,
                    "estimated_cost": joke.estimated_cost
                })
            
            total_cost += joke.estimated_cost
        
        # Get generation ID from first joke
        generation_id = generated_jokes[0].generation_id if generated_jokes else ""
        
        return GenerateJokesResponse(
            jokes=jokes_response,
            generation_id=generation_id,
            total_cost=total_cost,
            moderation_results=moderation_results
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {str(e)}"
        )


@router.post("/moderate", response_model=ModerateContentResponse)
async def moderate_content(
    request: ModerateContentRequest,
    device: DeviceInfo = Depends(get_current_device),
    ai_service: AIJokeService = Depends(get_ai_joke_service)
):
    """
    Check if content is safe using AI moderation.
    
    This endpoint can be used to test the moderation system or check
    user-submitted content before storage.
    """
    try:
        result = await ai_service.moderate_content(
            text=request.text,
            joke_id=request.joke_id
        )
        
        return ModerateContentResponse(
            safe=result.safe,
            flagged_categories=result.flagged_categories,
            scores=result.scores,
            joke_id=result.joke_id
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Moderation failed: {str(e)}"
        )


@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status(
    device: DeviceInfo = Depends(get_current_device),
    ai_service: AIJokeService = Depends(get_ai_joke_service)
):
    """
    Get AI service status and usage statistics.
    
    Returns information about the AI service configuration, cost tracking,
    and generation statistics.
    """
    try:
        from ..config import settings
        
        # Get cost summary
        cost_summary = ai_service.get_cost_summary()
        
        # Get generation stats (simplified for now)
        generation_stats = {
            "total_generations": cost_summary.get("requests_month", 0),
            "today_generations": cost_summary.get("requests_today", 0),
            "average_cost_per_joke": (
                cost_summary.get("monthly_total", 0) / cost_summary.get("requests_month", 1)
            ) if cost_summary.get("requests_month", 0) > 0 else 0
        }
        
        return AIStatusResponse(
            enabled=bool(settings.OPENAI_API_KEY),
            model=settings.OPENAI_MODEL,
            cost_summary=cost_summary,
            generation_stats=generation_stats
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get status: {str(e)}"
        )


@router.post("/generate-personalized")
async def generate_personalized_jokes(
    language: str = Query(default="en", description="Language code"),
    count: int = Query(default=5, ge=1, le=10, description="Number of jokes"),
    device: DeviceInfo = Depends(get_current_device),
    ai_service: AIJokeService = Depends(get_ai_joke_service),
    session=Depends(get_session)
):
    """
    Generate personalized jokes based on user preferences.
    
    This endpoint analyzes the user's interaction history and generates
    jokes tailored to their preferences.
    """
    try:
        user_id = device["device_id"]
        
        # Get user's tag preferences
        tag_repo = TagRepository(session)
        tag_scores = await tag_repo.get_user_tag_scores(user_id)
        
        # Group by category
        user_tags = {}
        for score in tag_scores:
            if score.score > 0:
                category = score.tag.category
                if category not in user_tags:
                    user_tags[category] = []
                user_tags[category].append((score.tag.value, score.score))
        
        if not user_tags:
            # No preferences yet, use defaults
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No user preferences found. Please interact with some jokes first."
            )
        
        # Generate personalized jokes
        jokes = await ai_service.generate_personalized_jokes(
            user_id=user_id,
            user_tags=user_tags,
            language=language,
            count=count
        )
        
        # Format response
        jokes_response = []
        total_cost = 0.0
        
        for joke in jokes:
            jokes_response.append({
                "text": joke.text,
                "tags": joke.tags,
                "language": joke.language,
                "confidence": joke.confidence,
                "personalized": True
            })
            total_cost += joke.estimated_cost
        
        return {
            "jokes": jokes_response,
            "count": len(jokes_response),
            "total_cost": total_cost,
            "user_id": user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {str(e)}"
        )


@router.get("/tags")
async def get_available_tags():
    """
    Get all available tags for joke generation.
    
    Returns the complete tag taxonomy organized by category.
    """
    return {
        "style": [
            "observational", "absurd", "wordplay", "sarcastic", "physical",
            "storytelling", "one_liner", "prop_comedy", "impressions", "self_deprecating"
        ],
        "format": [
            "question_answer", "setup_punchline", "list", "dialogue", "narrative",
            "riddle", "knock_knock", "meme", "quote", "comparison"
        ],
        "topic": [
            "relationships", "work", "technology", "food", "animals", "travel",
            "family", "sports", "politics", "science", "celebrities", "movies_tv",
            "music", "health", "money", "school", "weather", "holidays", "aging", "parenting"
        ],
        "tone": [
            "lighthearted", "witty", "silly", "clever", "dark", "wholesome",
            "edgy", "nostalgic", "optimistic", "cynical"
        ]
    }