from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions import DatabaseUnavailableException
from app.api.health.schema import HealthStatusResponse
from app.api.standard_response import StandardResponse, create_success_response
from app.connections.postgres import get_async_session

router = APIRouter(tags=["Health"])


@router.api_route("", methods=["GET", "HEAD"], response_model=StandardResponse[HealthStatusResponse])
async def check_health(
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        raise DatabaseUnavailableException("Tidak dapat terhubung ke database PostgreSQL") from exc

    return create_success_response(
        HealthStatusResponse(status="healthy", database="connected").model_dump()
    )
