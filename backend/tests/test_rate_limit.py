import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI, Request
from main import app
from middleware.rate_limit import limiter, jokes_limit, feedback_limit
import time

client = TestClient(app)

# Create a test endpoint with rate limiting
@app.get("/test/rate-limited")
@limiter.limit("2 per minute")
async def test_rate_limited(request: Request):
    return {"message": "success"}

def test_rate_limit_enforcement():
    """Test that rate limits are enforced"""
    # First two requests should succeed
    response1 = client.get("/test/rate-limited")
    assert response1.status_code == 200
    
    response2 = client.get("/test/rate-limited")
    assert response2.status_code == 200
    
    # Third request should be rate limited
    response3 = client.get("/test/rate-limited")
    assert response3.status_code == 429
    assert "Rate limit exceeded" in response3.json()["error"]

def test_rate_limit_headers():
    """Test that rate limit headers are included in responses"""
    response = client.get("/health")
    # Check for rate limit headers
    assert any(header.startswith("x-ratelimit") for header in response.headers.keys())

def test_rate_limit_exceeded_response_format():
    """Test the format of rate limit exceeded responses"""
    # Make requests to exceed the limit
    for _ in range(3):
        client.get("/test/rate-limited")
    
    response = client.get("/test/rate-limited")
    assert response.status_code == 429
    
    data = response.json()
    assert "error" in data
    assert "message" in data
    assert "Retry-After" in response.headers

def test_different_endpoints_have_different_limits():
    """Test that different endpoints can have different rate limits"""
    # This is a conceptual test - in practice, you'd test actual endpoints
    # with different rate limits
    assert jokes_limit is not None
    assert feedback_limit is not None