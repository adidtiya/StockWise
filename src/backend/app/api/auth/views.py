from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.schema import (
    LoginRequest,
    RefreshTokenResponse,
    RegisterRequest,
    UserResponse,
)
from app.api.auth.use_cases import (
    get_current_user_profile_use_case,
    login_user_use_case,
    refresh_access_token_use_case,
    register_user_use_case,
)
from app.api.depedencies import get_current_user, get_db
from app.api.standard_response import StandardResponse, create_success_response
from app.lib.jwt_utils import (
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    set_access_cookie,
    set_auth_cookies,
)
from app.models.user_model import User

router = APIRouter(tags=["Auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=StandardResponse[UserResponse],
)
async def register(
    payload: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_resp, access_token, refresh_token = await register_user_use_case(db, payload)
    set_auth_cookies(response, access_token, refresh_token)
    return create_success_response(user_resp.model_dump(mode="json"))


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[UserResponse],
)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_resp, access_token, refresh_token = await login_user_use_case(db, payload)
    set_auth_cookies(response, access_token, refresh_token)
    return create_success_response(user_resp.model_dump(mode="json"))


@router.post(
    "/refresh",
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[RefreshTokenResponse],
)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    refresh_tok = request.cookies.get(REFRESH_COOKIE_NAME)
    new_access_token = await refresh_access_token_use_case(db, refresh_tok)
    set_access_cookie(response, new_access_token)
    return create_success_response(
        RefreshTokenResponse(message="Access token berhasil diperbarui").model_dump()
    )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[None],
)
async def logout(response: Response) -> dict:
    clear_auth_cookies(response)
    return create_success_response(None)


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
    response_model=StandardResponse[UserResponse],
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> dict:
    user_resp = get_current_user_profile_use_case(current_user)
    return create_success_response(user_resp.model_dump(mode="json"))
