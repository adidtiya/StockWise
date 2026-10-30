from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.exceptions.exceptions import CustomException
from app.api.standard_response import create_error_response

logger = logging.getLogger(__name__)


def _get_request_id(request: Request) -> Optional[str]:
    return getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID")


async def custom_exception_handler(request: Request, exc: CustomException) -> JSONResponse:
    payload = create_error_response(
        code=exc.code,
        message=exc.message,
        request_id=_get_request_id(request),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=payload,
        headers=exc.headers,
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    errors = exc.errors()
    if errors:
        first = errors[0]
        loc_parts = [str(part) for part in first.get("loc", []) if part != "body"]
        field_name = ".".join(loc_parts) if loc_parts else "body"
        msg = f"{field_name}: {first.get('msg', 'Input tidak valid')}"
    else:
        msg = "Input tidak valid"

    payload = create_error_response(
        code="VALIDATION_ERROR",
        message=msg,
        request_id=_get_request_id(request),
    )
    return JSONResponse(status_code=422, content=payload)


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    if exc.status_code == 405 or exc.status_code == 404:
        status_code = 404
        code = "NOT_FOUND"
        message = "Endpoint tidak ditemukan" if exc.status_code == 405 else str(exc.detail or "Endpoint tidak ditemukan")
    else:
        status_code = exc.status_code
        code = "HTTP_EXCEPTION"
        message = str(exc.detail)

    payload = create_error_response(
        code=code,
        message=message,
        request_id=_get_request_id(request),
    )
    return JSONResponse(
        status_code=status_code,
        content=payload,
        headers=getattr(exc, "headers", None),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server exception: %s", exc)
    payload = create_error_response(
        code="INTERNAL_SERVER_ERROR",
        message="Terjadi kesalahan internal pada server",
        request_id=_get_request_id(request),
    )
    return JSONResponse(status_code=500, content=payload)


def setup_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(CustomException, custom_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

