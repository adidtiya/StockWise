from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


VALID_CATEGORIES = ("segar", "tahan_lama")


class IngredientCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    unit: str = Field(..., min_length=1, max_length=20)
    category: str = Field(...)
    shelf_life_days: int = Field(...)
    min_stock: float = Field(default=0.0)
    price: float = Field(default=0.0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Nama bahan baku wajib diisi")
        return cleaned

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Satuan bahan baku wajib diisi")
        return cleaned

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in VALID_CATEGORIES:
            raise ValueError("Kategori bahan wajib bernilai 'segar' atau 'tahan_lama'")
        return cleaned

    @field_validator("shelf_life_days")
    @classmethod
    def validate_shelf_life_days(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Masa simpan harus minimal 1 hari")
        return value

    @field_validator("min_stock")
    @classmethod
    def validate_min_stock(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Stok minimum tidak boleh bernilai negatif")
        return float(value)

    @field_validator("price")
    @classmethod
    def validate_price(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Harga bahan tidak boleh bernilai negatif")
        return float(value)


class IngredientUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    unit: Optional[str] = Field(default=None, max_length=20)
    category: Optional[str] = Field(default=None)
    shelf_life_days: Optional[int] = Field(default=None)
    min_stock: Optional[float] = Field(default=None)
    price: Optional[float] = Field(default=None)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Nama bahan baku tidak boleh kosong")
        return cleaned

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Satuan bahan baku tidak boleh kosong")
        return cleaned

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().lower()
        if cleaned not in VALID_CATEGORIES:
            raise ValueError("Kategori bahan wajib bernilai 'segar' atau 'tahan_lama'")
        return cleaned

    @field_validator("shelf_life_days")
    @classmethod
    def validate_shelf_life_days(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        if value < 1:
            raise ValueError("Masa simpan harus minimal 1 hari")
        return value

    @field_validator("min_stock")
    @classmethod
    def validate_min_stock(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        if value < 0:
            raise ValueError("Stok minimum tidak boleh bernilai negatif")
        return float(value)

    @field_validator("price")
    @classmethod
    def validate_price(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        if value < 0:
            raise ValueError("Harga bahan tidak boleh bernilai negatif")
        return float(value)


class IngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    unit: str
    category: str
    shelf_life_days: int
    min_stock: float
    price: float
    stock_now: float = 0.0


class IngredientListResponse(BaseModel):
    items: list[IngredientResponse]
    total: int
    limit: int
    offset: int

