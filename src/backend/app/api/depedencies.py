from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions import NotAuthenticatedException, ProPlanRequiredException
from app.connections.postgres import AsyncSessionLocal
from app.lib.jwt_utils import ACCESS_COOKIE_NAME, decode_token
from app.models.user_model import User

WIB = ZoneInfo("Asia/Jakarta")


def _today_wib() -> date:
    return datetime.now(WIB).date()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise NotAuthenticatedException("Sesi Anda telah berakhir, silakan login kembali")

    payload = decode_token(token)
    if not payload or payload.get("type") not in (None, "access"):
        raise NotAuthenticatedException("Sesi Anda telah berakhir, silakan login kembali")

    sub = payload.get("sub")
    try:
        user_id = int(sub)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise NotAuthenticatedException("Sesi Anda telah berakhir, silakan login kembali") from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotAuthenticatedException("Sesi Anda telah berakhir, silakan login kembali")

    if user.role == "pro" and user.pro_until is not None and user.pro_until < _today_wib():
        user.role = "freemium"
        await db.commit()
        await db.refresh(user)

    request.state.user_id = user.id
    return user


async def require_pro_plan(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "pro":
        raise ProPlanRequiredException()
    return current_user


__all__ = ["get_db", "get_current_user", "require_pro_plan"]

