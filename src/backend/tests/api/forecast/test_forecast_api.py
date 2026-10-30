from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_forecast_unauthenticated():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        resp = await client.get("/forecast")
        assert resp.status_code == 401
        data = resp.json()
        assert data["success"] is False
        assert data["error"]["code"] == "NotAuthenticatedException"


@pytest.mark.asyncio
async def test_recommendations_unauthenticated():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        resp = await client.get("/recommendations")
        assert resp.status_code == 401
        data = resp.json()
        assert data["success"] is False
        assert data["error"]["code"] == "NotAuthenticatedException"


@pytest.mark.asyncio
async def test_evaluation_unauthenticated():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        resp = await client.get("/evaluation")
        assert resp.status_code == 401
        data = resp.json()
        assert data["success"] is False
        assert data["error"]["code"] == "NotAuthenticatedException"


@pytest.mark.asyncio
async def test_forecast_invalid_days():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        # Register or login test user
        reg_payload = {
            "name": "Tester",
            "business_name": "Warung Test",
            "business_type": "warung",
            "email": "test_f5_api@stockwise.id",
            "password": "Password123!",
        }
        res_auth = await client.post("/auth/register", json=reg_payload)
        if res_auth.status_code not in (200, 201):
            res_auth = await client.post("/auth/login", json={"email": reg_payload["email"], "password": reg_payload["password"]})
        assert res_auth.status_code in (200, 201)

        # Invalid days = 5
        resp = await client.get("/forecast?days=5")
        assert resp.status_code == 422
        data = resp.json()
        assert data["success"] is False
        assert "Parameter days" in data["error"]["message"]


@pytest.mark.asyncio
async def test_evaluation_and_retrain():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        # Register or login test user
        reg_payload = {
            "name": "Tester",
            "business_name": "Warung Test",
            "business_type": "warung",
            "email": "test_f5_api@stockwise.id",
            "password": "Password123!",
        }
        res_auth = await client.post("/auth/register", json=reg_payload)
        if res_auth.status_code not in (200, 201):
            res_auth = await client.post("/auth/login", json={"email": reg_payload["email"], "password": reg_payload["password"]})
        assert res_auth.status_code in (200, 201)

        resp = await client.get("/evaluation")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "model" in data["data"]
        assert "products" in data["data"]

        # Test both /train and /retrain
        resp_train = await client.post("/evaluation/train")
        assert resp_train.status_code == 200
        assert resp_train.json()["success"] is True

        resp_retrain = await client.post("/evaluation/retrain")
        assert resp_retrain.status_code == 200
        assert resp_retrain.json()["success"] is True
