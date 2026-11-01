from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success_and_cookies(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"user_{uid}@stockwise.id"
    payload = {
        "name": f"User {uid}",
        "business_name": f"Katering {uid}",
        "business_type": "katering",
        "city": "Bandung",
        "phone": "081234567890",
        "email": email,
        "password": "Password123!",
    }

    resp = await async_client.post("/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["email"] == email
    assert data["data"]["name"] == payload["name"]
    assert data["data"]["business_name"] == payload["business_name"]
    assert data["data"]["role"] == "freemium"

    # Verifikasi cookie HttpOnly
    cookies_header = resp.headers.get_list("set-cookie")
    assert any("access_token=" in c and "httponly" in c.lower() for c in cookies_header)
    assert any("refresh_token=" in c and "httponly" in c.lower() for c in cookies_header)


@pytest.mark.asyncio
async def test_register_duplicate_email_rejected(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"dup_{uid}@stockwise.id"
    payload = {
        "name": "User Duplicate",
        "business_name": "Warung Dup",
        "business_type": "warung",
        "email": email,
        "password": "Password123!",
    }

    # First registration
    resp1 = await async_client.post("/auth/register", json=payload)
    assert resp1.status_code == 201

    # Second registration with identical email
    resp2 = await async_client.post("/auth/register", json=payload)
    assert resp2.status_code == 409
    data = resp2.json()
    assert data["success"] is False
    assert data["error"]["code"] == "EmailAlreadyRegisteredException"
    assert "sudah terdaftar" in data["error"]["message"].lower()


@pytest.mark.asyncio
async def test_login_success_and_cookies(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"login_{uid}@stockwise.id"
    password = "SecretPassword123!"
    reg_payload = {
        "name": "User Login",
        "business_name": "Rumah Makan Login",
        "business_type": "rumah_makan",
        "email": email,
        "password": password,
    }

    # Register first
    reg_resp = await async_client.post("/auth/register", json=reg_payload)
    assert reg_resp.status_code == 201

    # Login
    login_resp = await async_client.post("/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert data["success"] is True
    assert data["data"]["email"] == email

    # Verifikasi Set-Cookie HttpOnly
    cookies_header = login_resp.headers.get_list("set-cookie")
    assert any("access_token=" in c and "httponly" in c.lower() for c in cookies_header)
    assert any("refresh_token=" in c and "httponly" in c.lower() for c in cookies_header)


@pytest.mark.asyncio
async def test_login_failed_wrong_password(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"wrong_{uid}@stockwise.id"
    reg_payload = {
        "name": "User Wrong",
        "business_name": "Warung Wrong",
        "business_type": "warung",
        "email": email,
        "password": "CorrectPassword123!",
    }
    await async_client.post("/auth/register", json=reg_payload)

    # Attempt login with wrong password
    resp = await async_client.post("/auth/login", json={"email": email, "password": "WrongPassword999!"})
    assert resp.status_code == 401
    data = resp.json()
    assert data["success"] is False
    assert data["error"]["code"] == "InvalidCredentialsException"


@pytest.mark.asyncio
async def test_refresh_token_lifecycle(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"refresh_{uid}@stockwise.id"
    password = "Password123!"
    reg_payload = {
        "name": "User Refresh",
        "business_name": "Warung Refresh",
        "business_type": "warung",
        "email": email,
        "password": password,
    }
    reg_resp = await async_client.post("/auth/register", json=reg_payload)
    assert reg_resp.status_code == 201

    # Extract refresh_token from cookies
    refresh_token = reg_resp.cookies.get("refresh_token")
    assert refresh_token is not None

    # Call refresh endpoint with valid refresh cookie
    async_client.cookies.set("refresh_token", refresh_token)
    ref_resp = await async_client.post("/auth/refresh")
    assert ref_resp.status_code == 200
    ref_data = ref_resp.json()
    assert ref_data["success"] is True
    assert "berhasil diperbarui" in ref_data["data"]["message"]

    # Verify new access_token cookie is provided
    ref_cookies = ref_resp.headers.get_list("set-cookie")
    assert any("access_token=" in c and "httponly" in c.lower() for c in ref_cookies)

    # Test refresh with invalid token
    async_client.cookies.set("refresh_token", "invalid.garbage.token")
    fail_resp = await async_client.post("/auth/refresh")
    assert fail_resp.status_code == 401
    assert fail_resp.json()["error"]["code"] == "InvalidRefreshTokenException"
