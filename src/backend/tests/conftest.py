import pytest
from httpx import ASGITransport, AsyncClient

from app.connections.postgres import engine
from app.main import app
from app.middleware.rate_limit import rate_limiter


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

