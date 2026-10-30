from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.schema import UserResponse
from app.api.depedencies import get_current_user, get_db
from app.api.standard_response import StandardResponse, create_success_response
from app.api.user.schema import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    UpdateProfileRequest,
)
from app.api.user.use_cases import (
    change_user_password_use_case,
    delete_user_account_use_case,
    update_user_profile_use_case,
)
from app.lib.jwt_utils import clear_auth_cookies
from app.models.user_model import User

router = APIRouter(tags=["Users"])


@router.api_route(
    "/me",
    methods=["PATCH", "PUT"],
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[UserResponse],
)
async def update_my_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_resp = await update_user_profile_use_case(db, current_user, payload)
    return create_success_response(user_resp.model_dump(mode="json"))


@router.api_route(
    "/me/password",
    methods=["PATCH", "PUT"],
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[None],
)
async def change_my_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await change_user_password_use_case(db, current_user, payload)
    return create_success_response(None)


@router.delete(
    "/me",
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[None],
)
async def delete_my_account(
    response: Response,
    payload: Optional[DeleteAccountRequest] = Body(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await delete_user_account_use_case(db, current_user, payload)
    clear_auth_cookies(response)
    return create_success_response(None)

