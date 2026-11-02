from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.connections.postgres import AsyncSessionLocal
from app.main import app
from app.models.feedback_model import Feedback
from app.models.user_model import User

EMAIL = "test_f7_fb@stockwise.id"


@pytest.mark.asyncio
async def test_feedback_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        res = await client.post("/feedback", json={"rating": 5, "category": "x", "message": "y"})
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_feedback_saved_and_validated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        payload = {"name": "Tester", "business_name": "Warung FB", "business_type": "warung",
                   "email": EMAIL, "password": "Password123!"}
        res = await client.post("/auth/register", json=payload)
        if res.status_code not in (200, 201):
            res = await client.post("/auth/login", json={"email": EMAIL, "password": payload["password"]})
        assert res.status_code in (200, 201)

        assert (await client.post("/feedback", json={"rating": 6, "category": "x", "message": "y"})).status_code == 422
        assert (await client.post("/feedback", json={"rating": 0, "category": "x", "message": "y"})).status_code == 422

        msg = "Sangat membantu memotong limbah ayam harian!"
        ok = await client.post("/feedback", json={"rating": 5, "category": "rekomendasi_pembelian", "message": msg})
        assert ok.status_code == 201
        assert ok.json() == {"success": True, "data": None, "error": None}

        async with AsyncSessionLocal() as db:
            uid = (await db.execute(select(User.id).where(User.email == EMAIL))).scalar_one()
            rows = (await db.execute(select(Feedback).where(Feedback.user_id == uid, Feedback.message == msg))).scalars().all()
            assert rows and rows[0].rating == 5 and rows[0].category == "rekomendasi_pembelian"

