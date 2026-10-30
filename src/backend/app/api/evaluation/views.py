from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.evaluation.use_cases import EvaluationUseCase
from app.api.standard_response import create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get("")
async def get_evaluation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await EvaluationUseCase(db).evaluate(current_user.id)
    return create_success_response(data)


@router.post("/train")
@router.post("/retrain")
async def train_model(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await EvaluationUseCase(db).train(current_user.id)
    return create_success_response(data)
