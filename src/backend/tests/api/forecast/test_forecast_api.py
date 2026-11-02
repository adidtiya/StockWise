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


async def _setup_user_with_sales(
    client: AsyncClient,
    email: str,
    plan: str = "freemium",
    ing_name: str = "Daging Ayam",
    prod_name: str = "Nasi Ayam Bakar",
) -> tuple[int, int]:
    """Helper to create user, master data, batch, and 15 days of sales for forecast tests."""
    from datetime import date, timedelta

    reg = await client.post("/auth/register", json={
        "name": f"User {ing_name}",
        "business_name": f"Resto {ing_name}",
        "business_type": "katering",
        "email": email,
        "password": "Password123!",
        "plan": plan,
    })
    assert reg.status_code in (200, 201)

    # Tambah bahan baku
    ing_res = await client.post("/ingredients", json={
        "name": ing_name,
        "unit": "kg",
        "category": "segar",
        "shelf_life_days": 5,
        "min_stock": 5.0,
        "price": 35000.0,
    })
    assert ing_res.status_code in (200, 201)
    ing_id = ing_res.json()["data"]["id"]

    # Tambah menu produk
    prod_res = await client.post("/products", json={
        "name": prod_name,
        "price": 25000.0,
        "recipe": [{"ingredient_id": ing_id, "qty": 0.25}],
    })
    assert prod_res.status_code in (200, 201)
    prod_id = prod_res.json()["data"]["id"]

    # Tambah batch stok masuk
    today = date.today()
    batch_res = await client.post("/batches", json={
        "ingredient_id": ing_id,
        "qty": 500.0,
        "unit_price": 35000.0,
        "received_date": str(today - timedelta(days=25)),
        "expiry_date": str(today + timedelta(days=35)),
    })
    assert batch_res.status_code in (200, 201)

    # Tambah 15 hari penjualan berturut-turut agar memenuhi syarat minimal 14 hari riwayat aktif
    for offset in range(15, 0, -1):
        sale_date = today - timedelta(days=offset)
        s_res = await client.post("/sales", json={
            "product_id": prod_id,
            "qty": 10,
            "date": str(sale_date),
            "source": "manual",
        })
        assert s_res.status_code in (200, 201)

    return ing_id, prod_id


@pytest.mark.asyncio
async def test_forecast_freemium_horizon_and_values():
    import uuid
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        email = f"free_{uuid.uuid4().hex[:8]}@stockwise.id"
        await _setup_user_with_sales(client, email, plan="freemium", ing_name="Ayam Free")

        # 1. Horizon 7 hari diizinkan untuk Freemium
        resp_7 = await client.get("/forecast?days=7&view=bahan")
        assert resp_7.status_code == 200
        data_7 = resp_7.json()
        assert data_7["success"] is True
        payload = data_7["data"]
        assert payload["days_count"] == 7
        assert len(payload["ingredients"]) >= 1

        ing = payload["ingredients"][0]
        assert ing["name"] == "Ayam Free"
        assert ing["need_lo"] <= ing["total_need"] <= ing["need_hi"]
        assert len(ing["daily_needs"]) == 7
        for d in ing["daily_needs"]:
            assert d["need_lo"] <= d["need"] <= d["need_hi"]

        # 2. Horizon 14 hari ditolak untuk Freemium (403)
        resp_14 = await client.get("/forecast?days=14&view=bahan")
        assert resp_14.status_code == 403
        data_14 = resp_14.json()
        assert data_14["success"] is False
        assert data_14["error"]["code"] == "ProPlanRequiredException"

        # 3. Horizon 30 hari ditolak untuk Freemium (403)
        resp_30 = await client.get("/forecast?days=30&view=bahan")
        assert resp_30.status_code == 403
        data_30 = resp_30.json()
        assert data_30["success"] is False
        assert data_30["error"]["code"] == "ProPlanRequiredException"


@pytest.mark.asyncio
async def test_forecast_pro_horizon_allows_14_and_30():
    import uuid
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        email = f"pro_{uuid.uuid4().hex[:8]}@stockwise.id"
        await _setup_user_with_sales(client, email, plan="pro", ing_name="Ayam Pro")

        # 1. Horizon 14 hari sukses pada Pro
        resp_14 = await client.get("/forecast?days=14&view=bahan")
        assert resp_14.status_code == 200
        data_14 = resp_14.json()
        assert data_14["success"] is True
        assert data_14["data"]["days_count"] == 14
        assert len(data_14["data"]["ingredients"][0]["daily_needs"]) == 14

        # 2. Horizon 30 hari sukses pada Pro
        resp_30 = await client.get("/forecast?days=30&view=bahan")
        assert resp_30.status_code == 200
        data_30 = resp_30.json()
        assert data_30["success"] is True
        assert data_30["data"]["days_count"] == 30
        assert len(data_30["data"]["ingredients"][0]["daily_needs"]) == 30


@pytest.mark.asyncio
async def test_forecast_data_isolation_between_users():
    import uuid
    transport = ASGITransport(app=app)
    # User 1
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client1:
        email1 = f"iso1_{uuid.uuid4().hex[:8]}@stockwise.id"
        await _setup_user_with_sales(client1, email1, plan="freemium", ing_name="Ayam Khusus User1", prod_name="Menu User1")

        # User 2
        async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client2:
            email2 = f"iso2_{uuid.uuid4().hex[:8]}@stockwise.id"
            await _setup_user_with_sales(client2, email2, plan="freemium", ing_name="Beras Khusus User2", prod_name="Menu User2")

            # Verifikasi User 1 hanya melihat bahan miliknya
            resp1 = await client1.get("/forecast?days=7")
            assert resp1.status_code == 200
            names1 = [item["name"] for item in resp1.json()["data"]["ingredients"]]
            assert "Ayam Khusus User1" in names1
            assert "Beras Khusus User2" not in names1

            # Verifikasi User 2 hanya melihat bahan miliknya
            resp2 = await client2.get("/forecast?days=7")
            assert resp2.status_code == 200
            names2 = [item["name"] for item in resp2.json()["data"]["ingredients"]]
            assert "Beras Khusus User2" in names2
            assert "Ayam Khusus User1" not in names2

