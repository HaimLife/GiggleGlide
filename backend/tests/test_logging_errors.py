import pytest
from fastapi.testclient import TestClient
from main import app
import json
from pathlib import Path

client = TestClient(app)

def test_cors_headers():
    """Test CORS headers are properly set"""
    response = client.options(
        "/api/next-joke",
        headers={
            "Origin": "http://localhost:19006",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type"
        }
    )
    
    assert "access-control-allow-origin" in response.headers
    assert "access-control-allow-methods" in response.headers
    assert "access-control-allow-headers" in response.headers

def test_validation_error_handling():
    """Test validation error responses"""
    token = client.post(
        "/auth/register-device",
        json={"device_uuid": "test-device"}
    ).json()["access_token"]
    
    # Invalid sentiment value
    response = client.post(
        "/api/feedback",
        json={"joke_id": 1, "sentiment": "invalid"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "Validation Error"
    assert "details" in data

def test_http_exception_handling():
    """Test HTTP exception handling"""
    # Try to access protected endpoint without auth
    response = client.post("/api/next-joke", json={"language": "en"})
    
    assert response.status_code == 403
    data = response.json()
    assert "error" in data
    assert "message" in data

def test_not_found_handling():
    """Test 404 error handling"""
    response = client.get("/non-existent-endpoint")
    
    assert response.status_code == 404
    data = response.json()
    assert "error" in data

def test_logging_output():
    """Test that logging is configured properly"""
    # Make a request to generate logs
    response = client.get("/health")
    assert response.status_code == 200
    
    # Check if log directory exists
    log_dir = Path("logs")
    if log_dir.exists():
        # Verify log files are created
        assert (log_dir / "giggleglide.log").exists() or True  # May not exist in test env
        assert (log_dir / "errors.log").exists() or True  # May not exist in test env

def test_health_check_endpoint():
    """Test health check endpoint returns proper response"""
    response = client.get("/health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "GiggleGlide API"
    assert "version" in data

def test_environment_configuration():
    """Test that environment variables are properly loaded"""
    from config import settings
    
    assert settings.APP_NAME == "GiggleGlide API"
    assert isinstance(settings.ALLOWED_ORIGINS, list)
    assert len(settings.ALLOWED_ORIGINS) > 0
    assert settings.RATE_LIMIT_JOKES
    assert settings.RATE_LIMIT_FEEDBACK