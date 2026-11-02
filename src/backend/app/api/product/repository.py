from __future__ import annotations

from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient_model import Ingredient
from app.models.product_model import Product
from app.models.recipe_model import Recipe


class ProductRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id_and_user(
        self,
        product_id: int,
        user_id: int,
    ) -> Optional[Product]:
        stmt = select(Product).where(
            Product.id == product_id,
            Product.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_ingredients_by_ids(
        self,
        user_id: int,
        ingredient_ids: list[int],
    ) -> dict[int, Ingredient]:
        if not ingredient_ids:
            return {}
        stmt = select(Ingredient).where(
            Ingredient.user_id == user_id,
            Ingredient.id.in_(ingredient_ids),
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return {ing.id: ing for ing in rows}

    async def get_recipes_for_products(
        self,
        user_id: int,
        product_ids: list[int],
    ) -> dict[int, list[tuple[Recipe, Ingredient]]]:
        if not product_ids:
            return {}
        stmt = (
            select(Recipe, Ingredient)
            .join(Ingredient, Ingredient.id == Recipe.ingredient_id)
            .where(
                Recipe.product_id.in_(product_ids),
                Ingredient.user_id == user_id,
            )
            .order_by(Ingredient.name.asc(), Ingredient.id.asc())
        )
        rows = (await self.db.execute(stmt)).all()
        grouped: dict[int, list[tuple[Recipe, Ingredient]]] = {pid: [] for pid in product_ids}
        for rec, ing in rows:
            grouped.setdefault(rec.product_id, []).append((rec, ing))
        return grouped

    async def list_by_user(
        self,
        user_id: int,
        *,
        active: Optional[bool] = True,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Product], dict[int, list[tuple[Recipe, Ingredient]]], int]:
        count_stmt = select(func.count(Product.id)).where(Product.user_id == user_id)
        if active is not None:
            count_stmt = count_stmt.where(Product.active == active)
        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)

        stmt = select(Product).where(Product.user_id == user_id)
        if active is not None:
            stmt = stmt.where(Product.active == active)
        stmt = stmt.order_by(Product.name.asc(), Product.id.asc()).limit(limit).offset(offset)
        products = list((await self.db.execute(stmt)).scalars().all())

        recipes_map = await self.get_recipes_for_products(
            user_id,
            [p.id for p in products],
        )
        return products, recipes_map, total

    async def create_with_recipes(
        self,
        *,
        user_id: int,
        name: str,
        price: float,
        active: bool,
        recipes: list[tuple[int, float]],
    ) -> Product:
        product = Product(
            user_id=user_id,
            name=name,
            price=price,
            active=active,
        )
        self.db.add(product)
        await self.db.flush()

        for ingredient_id, qty in recipes:
            self.db.add(
                Recipe(
                    product_id=product.id,
                    ingredient_id=ingredient_id,
                    qty=qty,
                )
            )

        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def update_with_recipes(
        self,
        product: Product,
        *,
        name: Optional[str] = None,
        price: Optional[float] = None,
        active: Optional[bool] = None,
        recipes: Optional[list[tuple[int, float]]] = None,
    ) -> Product:
        if name is not None:
            product.name = name
        if price is not None:
            product.price = price
        if active is not None:
            product.active = active

        self.db.add(product)

        if recipes is not None:
            await self.db.execute(
                delete(Recipe).where(Recipe.product_id == product.id)
            )
            for ingredient_id, qty in recipes:
                self.db.add(
                    Recipe(
                        product_id=product.id,
                        ingredient_id=ingredient_id,
                        qty=qty,
                    )
                )

        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def deactivate_product(self, product: Product) -> None:
        product.active = False
        self.db.add(product)
        await self.db.commit()

