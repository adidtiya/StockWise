import pytest
from app.connections.postgres import engine
from app.middleware.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
async def cleanup_db_connections():
    # Reset penghitung rate limit in-memory agar tes yang login berulang tidak saling memblokir.
    rate_limiter.reset()
    yield
    await engine.dispose()
