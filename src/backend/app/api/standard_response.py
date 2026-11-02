from __future__ import annotations

from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: Optional[str] = None


class StandardResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None


class SuccessResponse(StandardResponse[T], Generic[T]):
    success: bool = True
    error: Optional[ErrorDetail] = None


def create_success_response(data: Any = None) -> dict[str, Any]:
    return {
        "success": True,
        "data": data,
        "error": None,
    }


def create_error_response(
    code: str,
    message: str,
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
        },
    }


# Aliases matching TRD 6.1.1
success_response = create_success_response
error_response = create_error_response

__all__ = [
    "ErrorDetail",
    "StandardResponse",
    "SuccessResponse",
    "create_success_response",
    "create_error_response",
    "success_response",
    "error_response",
]

