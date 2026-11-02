from __future__ import annotations

from pydantic import BaseModel


class HealthStatusResponse(BaseModel):
    status: str = "healthy"
    database: str = "connected"

