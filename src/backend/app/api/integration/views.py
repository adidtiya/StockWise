from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db, require_pro_plan
from app.api.exceptions import ProPlanRequiredException
from app.api.integration.schema import ConnectRequest
from app.api.integration.use_cases import IntegrationUseCase
from app.api.standard_response import create_success_response
from app.models.user_model import User

router = APIRouter()


async def require_pro_for_integration(current_user: User = Depends(get_current_user)) -> User:
    try:
        return await require_pro_plan(current_user)
    except ProPlanRequiredException:
        raise ProPlanRequiredException(
            "Sinkronisasi otomatis POS dan Food Delivery hanya tersedia untuk pengguna paket Pro"
        )


@router.get("")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_success_response(await IntegrationUseCase(db).list_status(current_user))


@router.post("/{provider}/connect", status_code=201)
async def connect(
    provider: str,
    body: ConnectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_pro_for_integration),
):
    return create_success_response(await IntegrationUseCase(db).connect_provider(current_user, provider, body.api_key))


@router.post("/{provider}/sync")
async def sync(
    provider: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_pro_for_integration),
):
    return create_success_response(await IntegrationUseCase(db).sync_provider(current_user, provider))

