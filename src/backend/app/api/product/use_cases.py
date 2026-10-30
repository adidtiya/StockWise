from __future__ import annotations

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions.exceptions import (
    BadRequestException,
    IngredientNotFoundException,
    ProductNotFoundException,
)
from app.api.product.repository import ProductRepository
from app.api.product.schema import (
    ProductCreateRequest,
    ProductListResponse,
    ProductResponse,
    ProductUpdateRequest,
    RecipeItemRequest,
    RecipeItemResponse,
)
from app.models.ingredient_model import Ingredient
from app.models.product_model import Product
from app.models.recipe_model import Recipe


def _to_product_response(
    product: Product,
    recipe_rows: list[tuple[Recipe, Ingredient]],
) -> ProductResponse:
    items = [
        RecipeItemResponse(
            ingredient_id=rec.ingredient_id,
            ingredient_name=ing.name,
            name=ing.name,
            qty=float(rec.qty),
            unit=ing.unit,
        )
        for rec, ing in recipe_rows
    ]
    return ProductResponse(
        id=product.id,
        name=product.name,
        price=float(product.price),
        active=bool(product.active),
        recipe=items,
        recipes=items,
    )


class ProductUseCases:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ProductRepository(db)

    async def _validate_recipe_items(
        self,
        user_id: int,
        recipe_items: list[RecipeItemRequest],
    ) -> list[tuple[int, float]]:
        if not recipe_items:
            raise BadRequestException("Isi minimal satu bahan pada komposisi menu")

        seen: set[int] = set()
        normalized: list[tuple[int, float]] = []
        for item in recipe_items:
            if item.ingredient_id in seen:
                raise BadRequestException("Bahan yang sama tercantum dua kali pada komposisi resep")
            if item.qty <= 0:
                raise BadRequestException("Takaran bahan pada resep harus lebih dari 0")
            seen.add(item.ingredient_id)
            normalized.append((item.ingredient_id, float(item.qty)))

        valid_map = await self.repo.get_user_ingredients_by_ids(user_id, list(seen))
        if len(valid_map) != len(seen):
            raise IngredientNotFoundException("Bahan baku pada komposisi resep tidak ditemukan")

        return normalized

    async def list_products(
        self,
        user_id: int,
        *,
        active: Optional[bool] = True,
        limit: int = 100,
        offset: int = 0,
    ) -> ProductListResponse:
        products, recipes_map, total = await self.repo.list_by_user(
            user_id,
            active=active,
            limit=limit,
            offset=offset,
        )
        items = [
            _to_product_response(prod, recipes_map.get(prod.id, []))
            for prod in products
        ]
        return ProductListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    async def get_product(self, user_id: int, product_id: int) -> ProductResponse:
        product = await self.repo.get_by_id_and_user(product_id, user_id)
        if product is None:
            raise ProductNotFoundException()
        recipes_map = await self.repo.get_recipes_for_products(user_id, [product.id])
        return _to_product_response(product, recipes_map.get(product.id, []))

    async def create_product(
        self,
        user_id: int,
        payload: ProductCreateRequest,
    ) -> ProductResponse:
        recipe_tuples = await self._validate_recipe_items(user_id, payload.recipes)
        product = await self.repo.create_with_recipes(
            user_id=user_id,
            name=payload.name,
            price=payload.price,
            active=payload.active,
            recipes=recipe_tuples,
        )
        recipes_map = await self.repo.get_recipes_for_products(user_id, [product.id])
        return _to_product_response(product, recipes_map.get(product.id, []))

    async def update_product(
        self,
        user_id: int,
        product_id: int,
        payload: ProductUpdateRequest,
    ) -> ProductResponse:
        product = await self.repo.get_by_id_and_user(product_id, user_id)
        if product is None:
            raise ProductNotFoundException()

        recipe_tuples: Optional[list[tuple[int, float]]] = None
        if payload.recipes is not None:
            recipe_tuples = await self._validate_recipe_items(user_id, payload.recipes)

        updated = await self.repo.update_with_recipes(
            product,
            name=payload.name,
            price=payload.price,
            active=payload.active,
            recipes=recipe_tuples,
        )
        recipes_map = await self.repo.get_recipes_for_products(user_id, [updated.id])
        return _to_product_response(updated, recipes_map.get(updated.id, []))

    async def delete_product(self, user_id: int, product_id: int) -> None:
        product = await self.repo.get_by_id_and_user(product_id, user_id)
        if product is None:
            raise ProductNotFoundException()
        await self.repo.deactivate_product(product)

