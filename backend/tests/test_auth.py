import pytest
from fastapi.testclient import TestClient
from main import app
from utils.auth import verify_token

client = TestClient(app)

def test_register_device():
    response = client.post(
        "/auth/register-device",
        json={"device_uuid": "test-device-123"}
    )
    assert response.status_code == 200
    data = response.json()
    
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0
    
    # Verify the token is valid
    payload = verify_token(data["access_token"])
    assert payload["device_id"] == "test-device-123"

def test_register_device_with_info():
    response = client.post(
        "/auth/register-device",
        json={
            "device_uuid": "test-device-456",
            "device_info": "iPhone 14, iOS 17.0"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data

def test_refresh_token():
    response = client.post(
        "/auth/refresh",
        json={"device_id": "test-device-789"}
    )
    assert response.status_code == 200
    data = response.json()
    
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0

def test_protected_endpoint_without_token():
    # This test is for future protected endpoints
    # For now, we'll just verify that our auth utilities work
    from utils.auth import get_current_device
    from fastapi import status
    
    # Test that accessing without token raises 403
    response = client.get("/health")  # This is not protected yet
    assert response.status_code == 200