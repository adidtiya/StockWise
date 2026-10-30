from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.feedback.schema import FeedbackCreateRequest
from app.api.feedback.use_cases import FeedbackUseCase
from app.api.standard_response import create_success_response
from app.models.user_model import User

router = APIRouter()


@router.post("", status_code=201)
async def submit_feedback(
    body: FeedbackCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await FeedbackUseCase(db).submit(current_user, body)
    return create_success_response(None)

