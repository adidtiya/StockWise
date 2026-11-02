from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=255)


class ProviderStatus(BaseModel):
    name: str
    label: str
    connected: bool
    last_sync: Optional[datetime] = None


class IntegrationStatusResponse(BaseModel):
    providers: list[ProviderStatus]


class ConnectResponse(BaseModel):
    provider: str
    connected: bool
    connected_at: datetime


class SyncResponse(BaseModel):
    provider: str
    synced_orders: int
    last_sync: datetime

