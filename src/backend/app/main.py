from __future__ import annotations

from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions.handlers import setup_exception_handlers
from app.api.health.schema import HealthStatusResponse
from app.api.health.views import check_health
from app.api.main import api_router
from app.api.standard_response import StandardResponse
from app.connections.postgres import get_async_session
from app.middleware.cors import setup_cors_middleware
from app.middleware.rate_limit import setup_rate_limit_middleware
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

app = FastAPI(
    title="StockWise API",
    version="1.0.0",
    description="StockWise Backend Modernization: FastAPI & PostgreSQL 16",
)

# Starlette executes middleware in reverse order of registration (LIFO):
# Incoming request order: RequestIDMiddleware -> SecurityHeadersMiddleware -> CORSMiddleware -> RateLimitMiddleware
setup_rate_limit_middleware(app)
setup_cors_middleware(app)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
setup_exception_handlers(app)

app.include_router(api_router, prefix="/api/v1")


@app.api_route("/healthz", methods=["GET", "HEAD"], response_model=StandardResponse[HealthStatusResponse], tags=["Health"])
async def healthz(
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    return await check_health(db=db)
