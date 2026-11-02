from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_dashboard_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        resp = await client.get("/dashboard")
        assert resp.status_code == 401
        assert resp.json()["error"]["code"] == "NotAuthenticatedException"


@pytest.mark.asyncio
async def test_dashboard_payload_shape():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        payload = {"name": "Tester", "business_name": "Warung Dash", "business_type": "warung",
                   "email": "test_f6_dash@stockwise.id", "password": "Password123!"}
        res = await client.post("/auth/register", json=payload)
        if res.status_code not in (200, 201):
            res = await client.post("/auth/login", json={"email": payload["email"], "password": payload["password"]})
        assert res.status_code in (200, 201)

        resp = await client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert set(data) == {"date", "counts", "waste", "risk", "buy", "portions"}
        assert set(data["counts"]) == {"products", "ingredients", "history_days"}
        assert set(data["waste"]) == {"current_month_cost", "previous_month_cost", "reduction_percentage"}
        assert set(data["risk"]) == {"high", "medium", "low"}
        assert set(data["buy"]) == {"items_to_buy", "estimated_total_cost"}
        assert isinstance(data["portions"], list)

