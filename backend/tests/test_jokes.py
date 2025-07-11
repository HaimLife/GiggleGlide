import pytest
from fastapi.testclient import TestClient
from main import app
from routes.jokes import jokes_db, feedback_db, seen_jokes_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_test_data():
    """Reset test data before each test"""
    feedback_db.clear()
    seen_jokes_db.clear()
    yield

def get_auth_token():
    """Helper to get auth token"""
    response = client.post(
        "/auth/register-device",
        json={"device_uuid": "test-device-jokes"}
    )
    return response.json()["access_token"]

def test_get_next_joke():
    token = get_auth_token()
    
    response = client.post(
        "/api/next-joke",
        json={"language": "en"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "text" in data
    assert data["language"] == "en"

def test_get_next_joke_excludes_seen():
    token = get_auth_token()
    
    # Get all jokes
    seen_ids = set()
    for _ in range(len(jokes_db)):
        response = client.post(
            "/api/next-joke",
            json={"language": "en"},
            headers={"Authorization": f"Bearer {token}"}
        )
        joke_id = response.json()["id"]
        assert joke_id not in seen_ids
        seen_ids.add(joke_id)

def test_submit_feedback():
    token = get_auth_token()
    
    # Get a joke first
    joke_response = client.post(
        "/api/next-joke",
        json={"language": "en"},
        headers={"Authorization": f"Bearer {token}"}
    )
    joke_id = joke_response.json()["id"]
    
    # Submit feedback
    response = client.post(
        "/api/feedback",
        json={"joke_id": joke_id, "sentiment": "like"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

def test_feedback_invalid_joke():
    token = get_auth_token()
    
    response = client.post(
        "/api/feedback",
        json={"joke_id": 9999, "sentiment": "like"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 404

def test_get_history():
    token = get_auth_token()
    
    # Submit some feedback
    for i in range(3):
        joke_response = client.post(
            "/api/next-joke",
            json={"language": "en"},
            headers={"Authorization": f"Bearer {token}"}
        )
        joke_id = joke_response.json()["id"]
        
        sentiment = ["like", "neutral", "dislike"][i % 3]
        client.post(
            "/api/feedback",
            json={"joke_id": joke_id, "sentiment": sentiment},
            headers={"Authorization": f"Bearer {token}"}
        )
    
    # Get history
    response = client.get(
        "/api/history",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["jokes"]) == 3
    assert data["total"] == 3

def test_get_user_stats():
    token = get_auth_token()
    
    # Submit varied feedback
    sentiments = ["like", "like", "neutral", "dislike"]
    for i in range(4):
        joke_response = client.post(
            "/api/next-joke",
            json={"language": "en"},
            headers={"Authorization": f"Bearer {token}"}
        )
        joke_id = joke_response.json()["id"]
        
        client.post(
            "/api/feedback",
            json={"joke_id": joke_id, "sentiment": sentiments[i]},
            headers={"Authorization": f"Bearer {token}"}
        )
    
    # Get stats
    response = client.get(
        "/api/stats",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["total_seen"] == 4
    assert data["liked"] == 2
    assert data["neutral"] == 1
    assert data["disliked"] == 1

def test_unauthorized_access():
    """Test that endpoints require authentication"""
    response = client.post("/api/next-joke", json={"language": "en"})
    assert response.status_code == 403  # No auth header
    
    response = client.post(
        "/api/next-joke",
        json={"language": "en"},
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401  # Invalid token