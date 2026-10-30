from __future__ import annotations

from datetime import date as dt_date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WasteLogCreateRequest(BaseModel):
    ingredient_id: int = Field(..., ge=1)
    qty: float = Field(...)
    date: Optional[dt_date] = Field(default=None)
    reason: str = Field(default="lainnya", max_length=255)

    @field_validator("qty")
    @classmethod
    def validate_qty(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Kuantitas bahan terbuang harus lebih dari 0")
        return float(value)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Alasan limbah bahan baku wajib diisi")
        return cleaned


class WasteLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingredient_id: int
    ingredient_name: Optional[str] = None
    unit: Optional[str] = None
    qty: float
    date: dt_date
    reason: str
    value: Optional[float] = None


class WasteLogListResponse(BaseModel):
    items: list[WasteLogResponse]
    total: int
    limit: int
    offset: int

