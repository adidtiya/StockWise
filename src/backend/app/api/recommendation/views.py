from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.recommendation.use_cases import RecommendationUseCase
from app.api.standard_response import create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get("")
async def get_recommendations(
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await RecommendationUseCase(db).execute(current_user, status=status)
    return create_success_response(data)
