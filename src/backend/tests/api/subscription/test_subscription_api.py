from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

EMAIL = "test_f7_sub@stockwise.id"


async def _login(client: AsyncClient) -> None:
    payload = {"name": "Tester", "business_name": "Warung Sub", "business_type": "warung",
               "email": EMAIL, "password": "Password123!"}
    res = await client.post("/auth/register", json=payload)
    if res.status_code not in (200, 201):
        res = await client.post("/auth/login", json={"email": EMAIL, "password": payload["password"]})
    assert res.status_code in (200, 201)


@pytest.mark.asyncio
async def test_subscription_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        assert (await client.get("/subscription")).status_code == 401


@pytest.mark.asyncio
async def test_checkout_then_cancel_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        await _login(client)
        await client.post("/subscription/cancel")  # reset ke freemium agar tes idempoten

        status = (await client.get("/subscription")).json()["data"]
        assert status["role"] == "freemium" and status["pro_until"] is None
        assert status["price_monthly"] == 100000
        assert status["methods"] == ["qris", "va_bca", "va_mandiri", "gopay"]

        bad = await client.post("/subscription/checkout", json={"method": "cash", "months": 1})
        assert bad.status_code == 422

        res = await client.post("/subscription/checkout", json={"method": "qris", "months": 1})
        assert res.status_code == 201
        data = res.json()["data"]
        assert data["amount"] == 100000 and data["status"] == "active"
        assert data["payment_simulation"] is True and data["order_id"].startswith("SUB-")

        me = (await client.get("/subscription")).json()["data"]
        assert me["role"] == "pro" and me["pro_until"] == data["pro_until"]
        assert me["payments"][0]["status"] == "completed"

        cancel = await client.post("/subscription/cancel")
        assert cancel.status_code == 200
        assert cancel.json()["data"]["role"] == "freemium"
        assert (await client.get("/subscription")).json()["data"]["role"] == "freemium"

