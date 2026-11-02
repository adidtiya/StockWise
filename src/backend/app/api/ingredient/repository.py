from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch_model import Batch
from app.models.ingredient_model import Ingredient


class IngredientRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id_and_user(
        self,
        ingredient_id: int,
        user_id: int,
    ) -> Optional[Ingredient]:
        stmt = select(Ingredient).where(
            Ingredient.id == ingredient_id,
            Ingredient.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_stock_now(self, ingredient_id: int, user_id: int) -> float:
        today = date.today()
        stmt = select(func.coalesce(func.sum(Batch.qty), 0.0)).where(
            Batch.ingredient_id == ingredient_id,
            Batch.user_id == user_id,
            Batch.qty > 0,
            Batch.expiry_date >= today,
        )
        result = await self.db.execute(stmt)
        val = result.scalar_one()
        return round(float(val or 0.0), 4)

    async def list_by_user(
        self,
        user_id: int,
        *,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[tuple[Ingredient, float]], int]:
        today = date.today()

        count_stmt = select(func.count(Ingredient.id)).where(Ingredient.user_id == user_id)
        if category:
            count_stmt = count_stmt.where(Ingredient.category == category)
        total_result = await self.db.execute(count_stmt)
        total = int(total_result.scalar_one() or 0)

        stock_subq = (
            select(
                Batch.ingredient_id.label("ingredient_id"),
                func.coalesce(func.sum(Batch.qty), 0.0).label("stock_now"),
            )
            .where(
                Batch.user_id == user_id,
                Batch.qty > 0,
                Batch.expiry_date >= today,
            )
            .group_by(Batch.ingredient_id)
            .subquery()
        )

        stmt = (
            select(
                Ingredient,
                func.coalesce(stock_subq.c.stock_now, 0.0).label("stock_now"),
            )
            .outerjoin(stock_subq, Ingredient.id == stock_subq.c.ingredient_id)
            .where(Ingredient.user_id == user_id)
        )
        if category:
            stmt = stmt.where(Ingredient.category == category)

        stmt = stmt.order_by(Ingredient.name.asc(), Ingredient.id.asc()).limit(limit).offset(offset)
        rows = (await self.db.execute(stmt)).all()
        items = [(row[0], round(float(row[1] or 0.0), 4)) for row in rows]
        return items, total

    async def create(
        self,
        *,
        user_id: int,
        name: str,
        unit: str,
        category: str,
        shelf_life_days: int,
        min_stock: float,
        price: float,
    ) -> Ingredient:
        ingredient = Ingredient(
            user_id=user_id,
            name=name,
            unit=unit,
            category=category,
            shelf_life_days=shelf_life_days,
            min_stock=min_stock,
            price=price,
        )
        self.db.add(ingredient)
        await self.db.commit()
        await self.db.refresh(ingredient)
        return ingredient

    async def update(
        self,
        ingredient: Ingredient,
        *,
        name: Optional[str] = None,
        unit: Optional[str] = None,
        category: Optional[str] = None,
        shelf_life_days: Optional[int] = None,
        min_stock: Optional[float] = None,
        price: Optional[float] = None,
    ) -> Ingredient:
        if name is not None:
            ingredient.name = name
        if unit is not None:
            ingredient.unit = unit
        if category is not None:
            ingredient.category = category
        if shelf_life_days is not None:
            ingredient.shelf_life_days = shelf_life_days
        if min_stock is not None:
            ingredient.min_stock = min_stock
        if price is not None:
            ingredient.price = price

        self.db.add(ingredient)
        await self.db.commit()
        await self.db.refresh(ingredient)
        return ingredient

    async def delete(self, ingredient: Ingredient) -> None:
        await self.db.delete(ingredient)
        await self.db.commit()

