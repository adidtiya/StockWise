from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BatchCreateRequest(BaseModel):
    ingredient_id: int = Field(..., ge=1)
    qty: float = Field(...)
    unit_price: Optional[float] = Field(default=None)
    received_date: Optional[date] = Field(default=None)
    expiry_date: Optional[date] = Field(default=None)
    source: str = Field(default="manual", max_length=50)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            copied = dict(data)
            if "received_date" not in copied and "date" in copied:
                copied["received_date"] = copied["date"]
            if copied.get("unit_price") == "":
                copied["unit_price"] = None
            return copied
        return data

    @field_validator("qty")
    @classmethod
    def validate_qty(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Kuantitas stok masuk harus lebih dari 0")
        return float(value)

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        if value < 0:
            raise ValueError("Harga satuan tidak boleh bernilai negatif")
        return float(value)

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        cleaned = value.strip().lower()
        return cleaned if cleaned else "manual"


class BatchPurchaseRequest(BaseModel):
    items: list[BatchCreateRequest] = Field(..., min_length=1)


class BatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingredient_id: int
    ingredient_name: Optional[str] = None
    unit: Optional[str] = None
    qty: float
    unit_price: Optional[float] = None
    received_date: date
    expiry_date: date
    source: str
    created_at: Optional[datetime] = None


class BatchListResponse(BaseModel):
    items: list[BatchResponse]
    total: int
    limit: int
    offset: int


class BatchPurchaseResponse(BaseModel):
    created_count: int
    batches: list[BatchResponse]

