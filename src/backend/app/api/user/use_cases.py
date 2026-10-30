from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.schema import UserResponse
from app.api.exceptions import (
    BadRequestException,
    EmailAlreadyRegisteredException,
    InvalidCurrentPasswordException,
)
from app.api.user.repository import (
    delete_user_by_id,
    get_other_user_by_email,
    update_user_fields,
)
from app.api.user.schema import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    UpdateProfileRequest,
)
from app.lib.jwt_utils import hash_password, verify_password
from app.models.user_model import User


async def update_user_profile_use_case(
    db: AsyncSession,
    current_user: User,
    payload: UpdateProfileRequest,
) -> UserResponse:
    updates: dict[str, Any] = {}

    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.email is not None:
        normalized_email = str(payload.email).strip().lower()
        taken = await get_other_user_by_email(db, normalized_email, current_user.id)
        if taken is not None:
            raise EmailAlreadyRegisteredException(
                f"Email {normalized_email} sudah terdaftar di sistem"
            )
        updates["email"] = normalized_email
    if payload.business_name is not None:
        updates["business_name"] = payload.business_name.strip()
    if payload.business_type is not None:
        updates["business_type"] = payload.business_type
    if payload.city is not None:
        updates["city"] = payload.city.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()

    if updates:
        current_user = await update_user_fields(db, current_user, updates)

    return UserResponse.model_validate(current_user)


async def change_user_password_use_case(
    db: AsyncSession,
    current_user: User,
    payload: ChangePasswordRequest,
) -> None:
    current_pw = payload.current_password or payload.current or ""
    new_pw = payload.new_password or payload.next or ""

    if not verify_password(current_pw, current_user.password_hash):
        raise InvalidCurrentPasswordException("Kata sandi saat ini tidak cocok")
    if len(new_pw) < 8:
        raise BadRequestException("Kata sandi baru minimal 8 karakter")

    await update_user_fields(db, current_user, {"password_hash": hash_password(new_pw)})


async def delete_user_account_use_case(
    db: AsyncSession,
    current_user: User,
    payload: Optional[DeleteAccountRequest] = None,
) -> None:
    if payload is not None and payload.password is not None:
        if not verify_password(payload.password, current_user.password_hash):
            raise InvalidCurrentPasswordException("Kata sandi saat ini tidak cocok")

    await delete_user_by_id(db, current_user.id)

