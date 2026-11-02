from __future__ import annotations

from datetime import date as dt_date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SaleItemInput(BaseModel):
    product_id: int = Field(..., ge=1)
    qty: int = Field(..., ge=1)

    @field_validator("qty")
    @classmethod
    def validate_qty(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Jumlah penjualan harus lebih dari 0")
        return int(value)


class SaleCreateRequest(BaseModel):
    product_id: Optional[int] = Field(default=None, ge=1)
    qty: Optional[int] = Field(default=None, ge=1)
    date: Optional[dt_date] = Field(default=None)
    source: str = Field(default="manual", max_length=50)
    items: list[SaleItemInput] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_input(cls, data: Any) -> Any:
        if isinstance(data, dict):
            copied = dict(data)
            items = copied.get("items")
            if not items and copied.get("product_id") is not None and copied.get("qty") is not None:
                copied["items"] = [
                    {
                        "product_id": int(copied["product_id"]),
                        "qty": int(round(float(copied["qty"]))),
                    }
                ]
            return copied
        return data

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        cleaned = value.strip().lower()
        return cleaned if cleaned else "manual"


class QuotaInfo(BaseModel):
    used: int
    limit: Optional[int] = None
    is_unlimited: bool


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: Optional[str] = None
    product: Optional[str] = None
    price: Optional[float] = None
    revenue: Optional[float] = None
    qty: int
    date: dt_date
    source: str
    created_at: Optional[datetime] = None


class SaleCreateResponse(BaseModel):
    id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    qty: Optional[int] = None
    date: dt_date
    source: str
    recorded_count: int
    created: int
    total: int
    quota: QuotaInfo
    items: list[SaleResponse]


class SaleListResponse(BaseModel):
    items: list[SaleResponse]
    total: int
    limit: int
    offset: int


class SaleImportRowError(BaseModel):
    row: int
    errors: list[str]


class SaleImportExcelResponse(BaseModel):
    imported_rows: int
    imported: int
    skipped: int = 0
    errors: list[SaleImportRowError] = Field(default_factory=list)


class SaleImportJsonRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(..., min_length=1)
    commit: bool = Field(default=True)


class SaleHistoryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_date: dt_date = Field( serialization_alias="from")
    to_date: dt_date = Field(serialization_alias="to")
    start_date: dt_date
    end_date: dt_date
    type: str = "sales"
    active_days: int
    total_records: int
    events: dict[str, list[str]] = Field(default_factory=dict)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    items: list[SaleResponse] = Field(default_factory=list)
