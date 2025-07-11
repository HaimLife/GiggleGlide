"""AI Joke Generation Service using OpenAI GPT-4o."""

import asyncio
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import uuid
from tenacity import retry, stop_after_attempt, wait_exponential

import openai
from openai import AsyncOpenAI

from ..config import settings
from ..database.models import Tag, TagStyle, TagFormat, TagTopic, TagTone
from ..database.repositories.joke_repository import JokeRepository
from ..database.repositories.tag_repository import TagRepository

logger = logging.getLogger(__name__)


@dataclass
class JokeGenerationRequest:
    """Request for joke generation."""
    tags: Dict[str, List[str]]  # category -> list of tags
    language: str = "en"
    count: int = 1
    user_id: Optional[str] = None
    temperature: float = 0.8


@dataclass
class GeneratedJoke:
    """Generated joke with metadata."""
    text: str
    tags: Dict[str, List[str]]
    language: str
    confidence: float
    model: str
    generation_id: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost: float = 0.0


@dataclass
class ModerationResult:
    """Result of content moderation."""
    safe: bool
    flagged_categories: List[str]
    scores: Dict[str, float]
    joke_id: Optional[str] = None


@dataclass
class CostTracker:
    """Track AI API costs."""
    monthly_total: float = 0.0
    daily_total: float = 0.0
    last_reset_date: datetime = None
    requests_today: int = 0
    requests_month: int = 0


class AIJokeService:
    """Service for AI-powered joke generation and moderation."""

    def __init__(self, joke_repo: JokeRepository, tag_repo: TagRepository):
        self.joke_repo = joke_repo
        self.tag_repo = tag_repo
        
        # Initialize OpenAI client
        if not settings.OPENAI_API_KEY:
            logger.warning("OpenAI API key not configured")
            self.client = None
        else:
            self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        
        # Cost tracking
        self.cost_tracker = CostTracker(last_reset_date=datetime.utcnow())
        
        # Generation cache (in production, use Redis)
        self._generation_cache = {}
        self._cache_expiry = {}
        
        # Model pricing (per 1K tokens)
        self.model_pricing = {
            "gpt-4o": {"input": 0.005, "output": 0.015},
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "gpt-4-turbo": {"input": 0.01, "output": 0.03},
            "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015}
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True
    )
    async def generate_jokes(
        self,
        request: JokeGenerationRequest
    ) -> List[GeneratedJoke]:
        """
        Generate jokes using OpenAI GPT-4o.
        
        Args:
            request: Joke generation request with tags and preferences
            
        Returns:
            List of generated jokes
        """
        if not self.client:
            raise ValueError("OpenAI client not initialized")
        
        # Check cost limits
        if not await self._check_cost_limits(request.count):
            raise ValueError("AI generation budget exceeded")
        
        try:
            # Build the prompt
            prompt = self._build_generation_prompt(request)
            
            # Call OpenAI API
            response = await self.client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": self._get_system_prompt(request.language)
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=request.temperature,
                max_tokens=settings.OPENAI_MAX_TOKENS * request.count,
                n=1,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            content = response.choices[0].message.content
            usage = response.usage
            
            # Track costs
            cost = self._calculate_cost(usage.prompt_tokens, usage.completion_tokens)
            await self._update_cost_tracking(cost)
            
            # Parse jokes from JSON response
            try:
                jokes_data = json.loads(content)
                jokes = jokes_data.get("jokes", [])
            except json.JSONDecodeError:
                logger.error(f"Failed to parse JSON response: {content}")
                jokes = []
            
            # Convert to GeneratedJoke objects
            generated_jokes = []
            generation_id = str(uuid.uuid4())
            
            for joke_data in jokes:
                generated_joke = GeneratedJoke(
                    text=joke_data.get("text", ""),
                    tags=joke_data.get("tags", request.tags),
                    language=request.language,
                    confidence=joke_data.get("confidence", 0.9),
                    model=settings.OPENAI_MODEL,
                    generation_id=generation_id,
                    prompt_tokens=usage.prompt_tokens // len(jokes) if jokes else 0,
                    completion_tokens=usage.completion_tokens // len(jokes) if jokes else 0,
                    estimated_cost=cost / len(jokes) if jokes else 0
                )
                generated_jokes.append(generated_joke)
            
            logger.info(f"Generated {len(generated_jokes)} jokes with cost ${cost:.4f}")
            return generated_jokes
            
        except Exception as e:
            logger.error(f"Error generating jokes: {str(e)}")
            raise

    async def moderate_content(
        self,
        text: str,
        joke_id: Optional[str] = None
    ) -> ModerationResult:
        """
        Check if joke content is safe using OpenAI Moderation API.
        
        Args:
            text: Joke text to moderate
            joke_id: Optional joke ID for tracking
            
        Returns:
            ModerationResult with safety assessment
        """
        if not self.client or not settings.MODERATION_ENABLED:
            # If moderation is disabled, assume content is safe
            return ModerationResult(
                safe=True,
                flagged_categories=[],
                scores={},
                joke_id=joke_id
            )
        
        try:
            # Call OpenAI Moderation API
            response = await self.client.moderations.create(
                model="text-moderation-latest",
                input=text
            )
            
            result = response.results[0]
            
            # Check against thresholds
            flagged_categories = []
            scores = {}
            
            # Map API categories to our thresholds
            threshold_map = {
                "violence": settings.MODERATION_THRESHOLD_VIOLENCE,
                "hate": settings.MODERATION_THRESHOLD_HATE,
                "self-harm": settings.MODERATION_THRESHOLD_SELF_HARM,
                "sexual": settings.MODERATION_THRESHOLD_SEXUAL,
            }
            
            for category, threshold in threshold_map.items():
                score = getattr(result.category_scores, category.replace("-", "_"), 0.0)
                scores[category] = score
                
                if score > threshold:
                    flagged_categories.append(category)
            
            # Determine if content is safe
            safe = len(flagged_categories) == 0
            
            if not safe:
                logger.warning(f"Content flagged for categories: {flagged_categories}")
            
            return ModerationResult(
                safe=safe,
                flagged_categories=flagged_categories,
                scores=scores,
                joke_id=joke_id
            )
            
        except Exception as e:
            logger.error(f"Error moderating content: {str(e)}")
            # In case of error, be conservative and flag as unsafe
            return ModerationResult(
                safe=False,
                flagged_categories=["error"],
                scores={"error": 1.0},
                joke_id=joke_id
            )

    async def generate_personalized_jokes(
        self,
        user_id: str,
        user_tags: Dict[str, List[Tuple[str, float]]],  # category -> [(tag, score)]
        language: str = "en",
        count: int = 5
    ) -> List[GeneratedJoke]:
        """
        Generate jokes personalized for a specific user.
        
        Args:
            user_id: User ID
            user_tags: User's tag preferences with scores
            language: Language for jokes
            count: Number of jokes to generate
            
        Returns:
            List of personalized generated jokes
        """
        # Select top tags from each category based on scores
        selected_tags = {}
        for category, tag_scores in user_tags.items():
            # Sort by score and take top tags
            sorted_tags = sorted(tag_scores, key=lambda x: x[1], reverse=True)
            selected_tags[category] = [tag for tag, score in sorted_tags[:3] if score > 0]
        
        # Create generation request
        request = JokeGenerationRequest(
            tags=selected_tags,
            language=language,
            count=count,
            user_id=user_id,
            temperature=0.8
        )
        
        # Generate jokes
        jokes = await self.generate_jokes(request)
        
        # Moderate all generated content
        safe_jokes = []
        for joke in jokes:
            moderation = await self.moderate_content(joke.text)
            if moderation.safe:
                safe_jokes.append(joke)
            else:
                logger.warning(f"Filtered unsafe joke for user {user_id}")
        
        return safe_jokes

    async def generate_fallback_jokes(
        self,
        language: str = "en",
        count: int = 10
    ) -> List[GeneratedJoke]:
        """
        Generate generic jokes for fallback scenarios.
        
        Args:
            language: Language for jokes
            count: Number of jokes to generate
            
        Returns:
            List of generic generated jokes
        """
        # Use popular, safe tags for fallback
        fallback_tags = {
            "style": ["observational", "wordplay", "one_liner"],
            "format": ["setup_punchline", "question_answer"],
            "topic": ["animals", "food", "technology"],
            "tone": ["lighthearted", "silly", "clever"]
        }
        
        request = JokeGenerationRequest(
            tags=fallback_tags,
            language=language,
            count=count,
            temperature=0.7  # Slightly lower for more consistent output
        )
        
        return await self.generate_jokes(request)

    async def batch_generate_and_store(
        self,
        generation_requests: List[JokeGenerationRequest]
    ) -> Dict[str, Any]:
        """
        Batch generate jokes and store them in the database.
        
        Args:
            generation_requests: List of generation requests
            
        Returns:
            Summary of generation results
        """
        results = {
            "total_requested": sum(req.count for req in generation_requests),
            "total_generated": 0,
            "total_stored": 0,
            "total_moderated": 0,
            "total_cost": 0.0,
            "errors": []
        }
        
        for request in generation_requests:
            try:
                # Generate jokes
                jokes = await self.generate_jokes(request)
                results["total_generated"] += len(jokes)
                
                # Store each joke
                for joke in jokes:
                    try:
                        # Moderate content
                        moderation = await self.moderate_content(joke.text)
                        results["total_moderated"] += 1
                        
                        if moderation.safe:
                            # Store in database
                            joke_id = await self._store_generated_joke(joke)
                            if joke_id:
                                results["total_stored"] += 1
                        else:
                            logger.warning(f"Skipped unsafe joke: {moderation.flagged_categories}")
                    
                    except Exception as e:
                        results["errors"].append(f"Failed to store joke: {str(e)}")
                
                results["total_cost"] += sum(j.estimated_cost for j in jokes)
                
            except Exception as e:
                results["errors"].append(f"Generation failed: {str(e)}")
        
        return results

    # Helper Methods
    
    def _build_generation_prompt(self, request: JokeGenerationRequest) -> str:
        """Build the prompt for joke generation."""
        # Format tags for the prompt
        tag_descriptions = []
        
        if "style" in request.tags and request.tags["style"]:
            tag_descriptions.append(f"Style: {', '.join(request.tags['style'])}")
        
        if "format" in request.tags and request.tags["format"]:
            tag_descriptions.append(f"Format: {', '.join(request.tags['format'])}")
        
        if "topic" in request.tags and request.tags["topic"]:
            tag_descriptions.append(f"Topics: {', '.join(request.tags['topic'])}")
        
        if "tone" in request.tags and request.tags["tone"]:
            tag_descriptions.append(f"Tone: {', '.join(request.tags['tone'])}")
        
        tags_text = "\n".join(tag_descriptions) if tag_descriptions else "General humor"
        
        prompt = f"""Generate {request.count} original joke(s) with the following characteristics:

{tags_text}
Language: {self._get_language_name(request.language)}

Requirements:
- Each joke should be original and creative
- Match the specified style, format, topics, and tone
- Be appropriate for a general audience
- Be funny and engaging

Return the response as a JSON object with this structure:
{{
    "jokes": [
        {{
            "text": "the joke text",
            "tags": {{
                "style": ["matching_style_tags"],
                "format": ["matching_format_tags"],
                "topic": ["matching_topic_tags"],
                "tone": ["matching_tone_tags"]
            }},
            "confidence": 0.9
        }}
    ]
}}"""
        
        return prompt

    def _get_system_prompt(self, language: str) -> str:
        """Get the system prompt for the AI."""
        return f"""You are a professional comedy writer creating original jokes for the GiggleGlide app. 
Your jokes should be:
- Original and creative (never copy existing jokes)
- Appropriate for all audiences
- Actually funny and well-crafted
- Matching the requested style, format, topics, and tone
- In {self._get_language_name(language)} language
- Following proper joke structure and timing

Always return valid JSON with the exact structure requested."""

    def _get_language_name(self, code: str) -> str:
        """Convert language code to full name."""
        language_map = {
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "ru": "Russian",
            "ja": "Japanese",
            "zh": "Chinese"
        }
        return language_map.get(code, "English")

    def _calculate_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculate the cost of an API call."""
        model = settings.OPENAI_MODEL
        pricing = self.model_pricing.get(model, self.model_pricing["gpt-4o"])
        
        input_cost = (prompt_tokens / 1000) * pricing["input"]
        output_cost = (completion_tokens / 1000) * pricing["output"]
        
        return input_cost + output_cost

    async def _check_cost_limits(self, request_count: int) -> bool:
        """Check if we're within cost limits."""
        if not settings.AI_COST_TRACKING_ENABLED:
            return True
        
        # Reset daily/monthly counters if needed
        now = datetime.utcnow()
        if self.cost_tracker.last_reset_date.date() != now.date():
            self.cost_tracker.daily_total = 0.0
            self.cost_tracker.requests_today = 0
            
            if self.cost_tracker.last_reset_date.month != now.month:
                self.cost_tracker.monthly_total = 0.0
                self.cost_tracker.requests_month = 0
            
            self.cost_tracker.last_reset_date = now
        
        # Estimate cost for this request
        estimated_tokens = request_count * 150  # Rough estimate
        estimated_cost = self._calculate_cost(estimated_tokens // 2, estimated_tokens // 2)
        
        # Check limits
        if estimated_cost > settings.AI_MAX_COST_PER_REQUEST:
            logger.warning(f"Request cost ${estimated_cost:.4f} exceeds per-request limit")
            return False
        
        if self.cost_tracker.monthly_total + estimated_cost > settings.AI_MONTHLY_BUDGET_USD:
            logger.warning(f"Monthly budget would be exceeded: ${self.cost_tracker.monthly_total + estimated_cost:.2f}")
            return False
        
        return True

    async def _update_cost_tracking(self, cost: float):
        """Update cost tracking metrics."""
        now = datetime.utcnow()
        
        self.cost_tracker.daily_total += cost
        self.cost_tracker.monthly_total += cost
        self.cost_tracker.requests_today += 1
        self.cost_tracker.requests_month += 1
        
        logger.debug(f"AI costs - Today: ${self.cost_tracker.daily_total:.4f}, "
                    f"Month: ${self.cost_tracker.monthly_total:.4f}")

    async def _store_generated_joke(self, joke: GeneratedJoke) -> Optional[str]:
        """Store a generated joke in the database."""
        try:
            # Create joke in database
            joke_data = {
                "text": joke.text,
                "language": joke.language,
                "source": "ai_generated",
                "external_id": joke.generation_id
            }
            
            stored_joke = await self.joke_repo.create(**joke_data)
            
            # Add tags
            for category, tag_names in joke.tags.items():
                for tag_name in tag_names:
                    # Find tag in database
                    tags = await self.tag_repo.get_tags_by_category(category)
                    tag = next((t for t in tags if t.value == tag_name), None)
                    
                    if tag:
                        await self.tag_repo.add_joke_tag(
                            joke_id=stored_joke.id,
                            tag_id=tag.id,
                            confidence=joke.confidence
                        )
            
            return stored_joke.id
            
        except Exception as e:
            logger.error(f"Failed to store generated joke: {str(e)}")
            return None

    def get_cost_summary(self) -> Dict[str, Any]:
        """Get current cost tracking summary."""
        return {
            "daily_total": self.cost_tracker.daily_total,
            "monthly_total": self.cost_tracker.monthly_total,
            "requests_today": self.cost_tracker.requests_today,
            "requests_month": self.cost_tracker.requests_month,
            "budget_remaining": settings.AI_MONTHLY_BUDGET_USD - self.cost_tracker.monthly_total,
            "last_reset": self.cost_tracker.last_reset_date.isoformat()
        }