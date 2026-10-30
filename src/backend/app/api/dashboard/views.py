from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dashboard.use_cases import DashboardUseCase
from app.api.depedencies import get_current_user, get_db
from app.api.standard_response import create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get("")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await DashboardUseCase(db).execute(current_user)
    return create_success_response(data)

