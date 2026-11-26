import os

import pytest
from httpx import ASGITransport, AsyncClient

from app.connections.postgres import engine
from app.main import app
from app.middleware.rate_limit import rate_limiter
from app.settings import settings


def pytest_configure(config):
    """Cegah test menulis ke database Supabase tanpa izin eksplisit.

    Test API membuat pengguna dan transaksi nyata. Jalankan test terhadap
    PostgreSQL lokal, atau set ALLOW_REMOTE_TESTS=1 bila memakai project
    Supabase khusus untuk pengujian.
    """
    host = (settings.POSTGRES_HOST or "").lower()
    database_url = (settings.DATABASE_URL or "").lower()
    is_remote = "supabase" in host or "supabase" in database_url
    if is_remote and os.getenv("ALLOW_REMOTE_TESTS") != "1":
        pytest.exit(
            "Test suite menulis data nyata. Gunakan PostgreSQL lokal atau set "
            "ALLOW_REMOTE_TESTS=1 jika memakai project Supabase khusus test.",
            returncode=2,
        )


@pytest.fixture(autouse=True)
async def cleanup_db_connections():
    # Reset penghitung rate limit in-memory agar tes yang login berulang tidak saling memblokir.
    rate_limiter.reset()
    yield
    await engine.dispose()


@pytest.fixture
async def async_client():
    """Client pengujian httpx.AsyncClient terhubung ke aplikasi FastAPI."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        yield client

