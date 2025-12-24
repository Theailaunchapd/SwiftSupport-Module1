import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_register_user():
    response = client.post("/users/register", json={"username": "testuser", "email": "test@example.com", "password": "securepass", "role": "customer"})
    assert response.status_code == 201
    assert "user_id" in response.json()

# Add more tests for edge cases (e.g., duplicate user, invalid input)
