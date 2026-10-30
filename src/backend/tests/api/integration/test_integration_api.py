from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.connections.postgres import AsyncSessionLocal
from app.main import app
from app.models.sale_model import Sale
from app.models.user_model import User

EMAIL = "test_f7_int@stockwise.id"


async def _login(client: AsyncClient) -> None:
    payload = {"name": "Tester", "business_name": "Warung Int", "business_type": "warung",
               "email": EMAIL, "password": "Password123!"}
    res = await client.post("/auth/register", json=payload)
    if res.status_code not in (200, 201):
        res = await client.post("/auth/login", json={"email": EMAIL, "password": payload["password"]})
    assert res.status_code in (200, 201)


@pytest.mark.asyncio
async def test_freemium_blocked_then_pro_sync_adds_sales():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        await _login(client)
        await client.post("/subscription/cancel")

        listing = await client.get("/integrations")
        assert listing.status_code == 200
        assert [p["name"] for p in listing.json()["data"]["providers"]] == ["mokapos", "gofood", "grabfood", "shopeefood"]

        blocked = await client.post("/integrations/mokapos/connect", json={"api_key": "k"})
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "ProPlanRequiredException"

        await client.post("/subscription/checkout", json={"method": "qris", "months": 1})
        assert (await client.post("/integrations/unknown/connect", json={"api_key": "k"})).status_code == 404

        conn = await client.post("/integrations/mokapos/connect", json={"api_key": "mokapos_secret_key_12345"})
        assert conn.status_code == 201
        assert conn.json()["data"]["connected"] is True

        # Pastikan ada produk aktif (butuh bahan + resep) agar sync menghasilkan penjualan
        ing = await client.post("/ingredients", json={"name": "Bahan Sync", "unit": "kg", "category": "segar",
                                                      "shelf_life_days": 3, "price": 1000})
        assert ing.status_code in (200, 201)
        ing_id = ing.json()["data"]["id"]
        prod = await client.post("/products", json={"name": "Menu Sync", "price": 10000,
                                                    "recipes": [{"ingredient_id": ing_id, "qty": 0.1}]})
        assert prod.status_code in (200, 201)

        sync = await client.post("/integrations/mokapos/sync")
        assert sync.status_code == 200
        assert sync.json()["data"]["synced_orders"] > 0

        async with AsyncSessionLocal() as db:
            uid = (await db.execute(select(User.id).where(User.email == EMAIL))).scalar_one()
            count = (await db.execute(
                select(func.count(Sale.id)).where(Sale.user_id == uid, Sale.source == "mokapos")
            )).scalar_one()
            assert count >= sync.json()["data"]["synced_orders"]


@pytest.mark.asyncio
async def test_sync_not_connected_conflict():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        await _login(client)
        await client.post("/subscription/checkout", json={"method": "qris", "months": 1})
        res = await client.post("/integrations/shopeefood/sync")
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "IntegrationNotConnectedException"
