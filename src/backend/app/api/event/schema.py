from __future__ import annotations

from datetime import date as dt_date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    date: dt_date = Field(...)
    impact: float = Field(default=1.0)
    category: str = Field(default="custom", max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Nama event wajib diisi")
        return cleaned

    @field_validator("impact")
    @classmethod
    def validate_impact(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Angka dampak pengali (impact) harus lebih dari 0")
        return float(value)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        cleaned = value.strip().lower()
        return cleaned if cleaned else "custom"


class EventUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    date: Optional[dt_date] = Field(default=None)
    impact: Optional[float] = Field(default=None)
    category: Optional[str] = Field(default=None, max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Nama event tidak boleh kosong")
        return cleaned

    @field_validator("impact")
    @classmethod
    def validate_impact(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("Angka dampak pengali (impact) harus lebih dari 0")
        return float(value)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned else "custom"


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    date: dt_date
    impact: float
    category: str


class EventListResponse(BaseModel):
    items: list[EventResponse]
    total: int
    limit: int
    offset: int

