from __future__ import annotations

import base64
import json
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from typing import Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.standard_response import create_error_response
from app.settings import settings

AUTH_PATHS = {"/api/v1/auth/login", "/api/v1/auth/register"}
EXEMPT_PATHS = {"/api/v1/health", "/healthz"}


def _parse_rate_limit(spec: str, default_limit: int = 60, default_window: int = 60) -> tuple[int, int]:
    try:
        count_part, period_part = spec.strip().lower().split("/", 1)
        limit = int(count_part)
        if period_part.startswith("sec"):
            window = 1
        elif period_part.startswith("hour"):
            window = 3600
        else:
            window = 60
        return limit, window
    except Exception:
        return default_limit, default_window


def _extract_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def _extract_user_id_from_cookie(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload_b64 = parts[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes.decode("utf-8"))
        sub = payload.get("sub")
        return str(sub) if sub is not None else None
    except Exception:
        return None


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        self._buckets.clear()

    def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        bucket = self._buckets[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= limit:
            elapsed = now - bucket[0]
            remaining = max(1, int(round(window_seconds - elapsed)))
            return False, remaining

        bucket.append(now)
        return True, 0


rate_limiter = InMemoryRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = request.url.path.rstrip("/") or "/"
        if request.method == "OPTIONS" or not path.startswith("/api/v1") or path in EXEMPT_PATHS:
            return await call_next(request)

        client_ip = _extract_client_ip(request)

        if path in AUTH_PATHS:
            limit, window = _parse_rate_limit(settings.RATE_LIMIT_AUTH, default_limit=5, default_window=60)
            bucket_key = f"auth:{path}:{client_ip}"
            allowed, _ = rate_limiter.check(bucket_key, limit=limit, window_seconds=window)
            if not allowed:
                retry_after = window
                if path.endswith("/register"):
                    msg = f"Terlalu banyak permintaan pendaftaran dari alamat IP ini. Silakan coba lagi setelah {retry_after} detik."
                else:
                    msg = f"Terlalu banyak percobaan masuk dari alamat IP ini. Silakan coba lagi setelah {retry_after} detik."
                request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID")
                return JSONResponse(
                    status_code=429,
                    content=create_error_response(
                        code="RateLimitExceededException",
                        message=msg,
                        request_id=request_id,
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
        else:
            limit, window = _parse_rate_limit(settings.RATE_LIMIT_DEFAULT, default_limit=60, default_window=60)
            user_id = _extract_user_id_from_cookie(request)
            identity = f"user:{user_id}" if user_id else f"ip:{client_ip}"
            bucket_key = f"api:{identity}"
            allowed, retry_after = rate_limiter.check(bucket_key, limit=limit, window_seconds=window)
            if not allowed:
                request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID")
                return JSONResponse(
                    status_code=429,
                    content=create_error_response(
                        code="RateLimitExceededException",
                        message="Batas permintaan per menit terlampaui. Silakan tunggu beberapa saat.",
                        request_id=request_id,
                    ),
                    headers={"Retry-After": str(retry_after)},
                )

        return await call_next(request)


def setup_rate_limit_middleware(app: FastAPI) -> None:
    app.add_middleware(RateLimitMiddleware)

