from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Response
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.settings import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(user_id: int | str, role: str = "freemium") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: int | str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def set_access_cookie(response: Response, access_token: str) -> None:
    access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    secure_cookie = settings.APP_ENV == "production"
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=access_max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure_cookie,
    )


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: Optional[str] = None,
) -> None:
    set_access_cookie(response, access_token)
    if refresh_token is not None:
        refresh_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
        secure_cookie = settings.APP_ENV == "production"
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=refresh_token,
            max_age=refresh_max_age,
            path="/",
            httponly=True,
            samesite="lax",
            secure=secure_cookie,
        )


def clear_auth_cookies(response: Response) -> None:
    secure_cookie = settings.APP_ENV == "production"
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value="",
        max_age=0,
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure_cookie,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value="",
        max_age=0,
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure_cookie,
    )
