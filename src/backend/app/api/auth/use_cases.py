from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.repository import create_user_record, get_user_by_email, get_user_by_id
from app.api.auth.schema import LoginRequest, RegisterRequest, UserResponse
from app.api.exceptions import (
    EmailAlreadyRegisteredException,
    InvalidCredentialsException,
    InvalidRefreshTokenException,
)
from app.lib.jwt_utils import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user_model import User

WIB = ZoneInfo("Asia/Jakarta")


async def register_user_use_case(
    db: AsyncSession,
    payload: RegisterRequest,
) -> tuple[UserResponse, str, str]:
    normalized_email = str(payload.email).strip().lower()
    existing = await get_user_by_email(db, normalized_email)
    if existing is not None:
        raise EmailAlreadyRegisteredException(
            f"Email {normalized_email} sudah terdaftar di sistem"
        )

    role = "pro" if payload.plan == "pro" else "freemium"
    pro_until = (
        datetime.now(WIB).date() + timedelta(days=30)
        if role == "pro"
        else None
    )

    user = await create_user_record(
        db,
        name=payload.name,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        business_name=payload.business_name,
        business_type=payload.business_type,
        city=payload.city,
        phone=payload.phone,
        role=role,
        pro_until=pro_until,
    )

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    return UserResponse.model_validate(user), access_token, refresh_token


async def login_user_use_case(
    db: AsyncSession,
    payload: LoginRequest,
) -> tuple[UserResponse, str, str]:
    normalized_email = str(payload.email).strip().lower()
    user = await get_user_by_email(db, normalized_email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise InvalidCredentialsException("Email atau kata sandi yang Anda masukkan salah")

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    return UserResponse.model_validate(user), access_token, refresh_token


async def refresh_access_token_use_case(
    db: AsyncSession,
    refresh_token: Optional[str],
) -> str:
    if not refresh_token:
        raise InvalidRefreshTokenException(
            "Sesi refresh token tidak valid atau telah kedaluwarsa, silakan login kembali"
        )

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise InvalidRefreshTokenException(
            "Sesi refresh token tidak valid atau telah kedaluwarsa, silakan login kembali"
        )

    sub = payload.get("sub")
    try:
        user_id = int(sub)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise InvalidRefreshTokenException(
            "Sesi refresh token tidak valid atau telah kedaluwarsa, silakan login kembali"
        ) from exc

    user = await get_user_by_id(db, user_id)
    if user is None:
        raise InvalidRefreshTokenException(
            "Sesi refresh token tidak valid atau telah kedaluwarsa, silakan login kembali"
        )

    return create_access_token(user.id, user.role)


def get_current_user_profile_use_case(current_user: User) -> UserResponse:
    return UserResponse.model_validate(current_user)
