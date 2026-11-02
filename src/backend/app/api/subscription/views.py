from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.standard_response import create_success_response
from app.api.subscription.schema import CheckoutRequest
from app.api.subscription.use_cases import SubscriptionUseCase
from app.models.user_model import User

router = APIRouter()


@router.get("")
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_success_response(await SubscriptionUseCase(db).get_status(current_user))


@router.post("/checkout", status_code=201)
async def checkout(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_success_response(await SubscriptionUseCase(db).checkout_simulation(current_user, body))


@router.post("/cancel")
async def cancel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_success_response(await SubscriptionUseCase(db).cancel_subscription(current_user))

