# AI Joke Generation and Moderation Integration

This document describes the AI integration for GiggleGlide, which uses OpenAI's GPT-4o for joke generation and content moderation.

## Overview

The AI integration provides:
- Dynamic joke generation based on user preferences
- Content moderation for safety
- Fallback joke generation when cache is empty
- Cost tracking and budget controls
- Batch generation for maintaining joke inventory

## Configuration

Set the following environment variables in your `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o  # or gpt-4o-mini for lower cost
OPENAI_MAX_TOKENS=200
OPENAI_TEMPERATURE=0.8

# Cost Controls
AI_MONTHLY_BUDGET_USD=100.0
AI_MAX_COST_PER_REQUEST=0.10
AI_COST_TRACKING_ENABLED=True

# Moderation Thresholds
MODERATION_ENABLED=True
MODERATION_THRESHOLD_VIOLENCE=0.7
MODERATION_THRESHOLD_HATE=0.5
```

## Architecture

### Components

1. **AIJokeService** (`services/ai_joke_service.py`)
   - Handles joke generation and moderation
   - Manages cost tracking
   - Provides batch generation capabilities

2. **Personalization Integration**
   - Fallback to AI when insufficient jokes
   - Personalized generation based on user tags
   - Cooldown management to prevent overuse

3. **Background Jobs**
   - Periodic batch generation to maintain cache
   - Cost-optimized generation scheduling

### Flow

1. User requests joke → Check cache
2. If cache insufficient → Check AI cooldown
3. If allowed → Generate personalized jokes
4. Moderate content → Store safe jokes
5. Track costs → Update usage metrics

## API Endpoints

### Generate Jokes
```http
POST /api/ai/generate
{
  "tags": {
    "style": ["observational", "wordplay"],
    "format": ["setup_punchline"],
    "topic": ["technology"],
    "tone": ["witty"]
  },
  "language": "en",
  "count": 5,
  "temperature": 0.8
}
```

### Moderate Content
```http
POST /api/ai/moderate
{
  "text": "Joke text to moderate",
  "joke_id": "optional-joke-id"
}
```

### Get AI Status
```http
GET /api/ai/status
```

Returns cost tracking and usage statistics.

### Generate Personalized
```http
POST /api/ai/generate-personalized?language=en&count=5
```

Generates jokes based on user's interaction history.

## Cost Management

The system implements multiple cost controls:

1. **Monthly Budget**: Stops generation when budget exceeded
2. **Per-Request Limit**: Prevents expensive single requests
3. **Batch Optimization**: Groups generations for efficiency
4. **Model Selection**: Configurable model (gpt-4o vs gpt-4o-mini)

### Pricing (as of 2024)
- GPT-4o: $5/1M input tokens, $15/1M output tokens
- GPT-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens

## Safety and Moderation

All generated content passes through OpenAI's moderation API:

1. **Categories Checked**:
   - Violence
   - Hate speech
   - Self-harm
   - Sexual content

2. **Thresholds**: Configurable per category (0.0-1.0)

3. **Filtering**: Unsafe content is logged but not stored

## Tag System Integration

The AI respects the existing tag taxonomy:

### Style Tags
- observational, absurd, wordplay, sarcastic, physical, etc.

### Format Tags
- question_answer, setup_punchline, knock_knock, etc.

### Topic Tags
- relationships, work, technology, food, animals, etc.

### Tone Tags
- lighthearted, witty, silly, clever, dark, wholesome, etc.

## Testing

Run AI integration tests:
```bash
pytest tests/test_ai_joke_service.py
pytest tests/test_personalization/test_ai_integration.py
```

## Monitoring

Track AI usage through:
1. Cost summary endpoint: `/api/ai/status`
2. Database tables: `ai_usage_tracking`, `ai_cost_tracking`
3. Log monitoring for generation failures

## Best Practices

1. **Start Conservative**: Begin with low generation limits
2. **Monitor Costs**: Check daily/monthly spend regularly
3. **Test Prompts**: Refine prompts for better quality
4. **Cache Aggressively**: Minimize API calls
5. **Handle Failures**: Always have non-AI fallbacks

## Troubleshooting

### No Jokes Generated
- Check API key configuration
- Verify budget not exceeded
- Check moderation settings

### High Costs
- Reduce batch sizes
- Increase cooldown periods
- Switch to gpt-4o-mini
- Lower generation frequency

### Poor Quality
- Adjust temperature (0.7-0.9 range)
- Refine prompt templates
- Add more specific tag guidance

## Security Considerations

1. **API Key**: Never commit to version control
2. **User Input**: Never pass raw user input to prompts
3. **Rate Limiting**: Implement per-user generation limits
4. **Monitoring**: Watch for abuse patterns