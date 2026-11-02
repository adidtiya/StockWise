from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RecipeItemRequest(BaseModel):
    ingredient_id: int = Field(..., ge=1)
    qty: float = Field(...)

    @field_validator("qty")
    @classmethod
    def validate_qty(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Takaran bahan pada resep harus lebih dari 0")
        return float(value)


class ProductCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    price: float = Field(default=0.0)
    active: bool = Field(default=True)
    recipes: list[RecipeItemRequest] = Field(..., min_length=1)

    @model_validator(mode="before")
    @classmethod
    def normalize_recipe_field(cls, data: Any) -> Any:
        if isinstance(data, dict):
            copied = dict(data)
            if "recipes" not in copied and "recipe" in copied:
                copied["recipes"] = copied["recipe"]
            return copied
        return data

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Nama menu produk wajib diisi")
        return cleaned

    @field_validator("price")
    @classmethod
    def validate_price(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Harga jual menu tidak boleh bernilai negatif")
        return float(value)


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    price: Optional[float] = Field(default=None)
    active: Optional[bool] = Field(default=None)
    recipes: Optional[list[RecipeItemRequest]] = Field(default=None)

    @model_validator(mode="before")
    @classmethod
    def normalize_recipe_field(cls, data: Any) -> Any:
        if isinstance(data, dict):
            copied = dict(data)
            if "recipes" not in copied and "recipe" in copied:
                copied["recipes"] = copied["recipe"]
            return copied
        return data

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Nama menu produk tidak boleh kosong")
        return cleaned

    @field_validator("price")
    @classmethod
    def validate_price(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        if value < 0:
            raise ValueError("Harga jual menu tidak boleh bernilai negatif")
        return float(value)


class RecipeItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ingredient_id: int
    ingredient_name: str
    name: str
    qty: float
    unit: str


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: float
    active: bool
    recipe: list[RecipeItemResponse]
    recipes: list[RecipeItemResponse]


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    limit: int
    offset: int

