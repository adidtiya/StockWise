from __future__ import annotations

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions.exceptions import BadRequestException, IngredientNotFoundException
from app.api.ingredient.repository import IngredientRepository
from app.api.ingredient.schema import (
     VALID_CATEGORIES,
    IngredientCreateRequest,
    IngredientListResponse,
    IngredientResponse,
    IngredientUpdateRequest,
)
from app.models.ingredient_model import Ingredient


def _to_response(ingredient: Ingredient, stock_now: float = 0.0) -> IngredientResponse:
    return IngredientResponse(
        id=ingredient.id,
        name=ingredient.name,
        unit=ingredient.unit,
        category=ingredient.category,
        shelf_life_days=ingredient.shelf_life_days,
        min_stock=float(ingredient.min_stock),
        price=float(ingredient.price),
        stock_now=float(stock_now),
    )


class IngredientUseCases:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = IngredientRepository(db)

    async def list_ingredients(
        self,
        user_id: int,
        *,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> IngredientListResponse:
        if category is not None:
            cleaned_cat = category.strip().lower()
            if cleaned_cat not in VALID_CATEGORIES:
                raise BadRequestException("Kategori filter hanya boleh 'segar' atau 'tahan_lama'")
            category = cleaned_cat

        rows, total = await self.repo.list_by_user(
            user_id,
            category=category,
            limit=limit,
            offset=offset,
        )
        items = [_to_response(ing, stock_now) for ing, stock_now in rows]
        return IngredientListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    async def get_ingredient(self, user_id: int, ingredient_id: int) -> IngredientResponse:
        ingredient = await self.repo.get_by_id_and_user(ingredient_id, user_id)
        if ingredient is None:
            raise IngredientNotFoundException()
        stock_now = await self.repo.get_stock_now(ingredient.id, user_id)
        return _to_response(ingredient, stock_now)

    async def create_ingredient(
        self,
        user_id: int,
        payload: IngredientCreateRequest,
    ) -> IngredientResponse:
        if not payload.name.strip():
            raise BadRequestException("Nama bahan baku tidak boleh kosong")
        if payload.shelf_life_days <= 0:
            raise BadRequestException("Masa simpan harus lebih dari 0 hari")
        if payload.min_stock < 0:
            raise BadRequestException("Stok minimum tidak boleh negatif")

        ingredient = await self.repo.create(
            user_id=user_id,
            name=payload.name,
            unit=payload.unit,
            category=payload.category,
            shelf_life_days=payload.shelf_life_days,
            min_stock=payload.min_stock,
            price=payload.price,
        )
        return _to_response(ingredient, 0.0)

    async def update_ingredient(
        self,
        user_id: int,
        ingredient_id: int,
        payload: IngredientUpdateRequest,
    ) -> IngredientResponse:
        ingredient = await self.repo.get_by_id_and_user(ingredient_id, user_id)
        if ingredient is None:
            raise IngredientNotFoundException()

        updated = await self.repo.update(
            ingredient,
            name=payload.name,
            unit=payload.unit,
            category=payload.category,
            shelf_life_days=payload.shelf_life_days,
            min_stock=payload.min_stock,
            price=payload.price,
        )
        stock_now = await self.repo.get_stock_now(updated.id, user_id)
        return _to_response(updated, stock_now)

    async def delete_ingredient(self, user_id: int, ingredient_id: int) -> None:
        ingredient = await self.repo.get_by_id_and_user(ingredient_id, user_id)
        if ingredient is None:
            raise IngredientNotFoundException()
        await self.repo.delete(ingredient)

