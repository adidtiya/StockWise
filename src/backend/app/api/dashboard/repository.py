from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch_model import Batch
from app.models.ingredient_model import Ingredient
from app.models.product_model import Product
from app.models.recipe_model import Recipe
from app.models.sale_model import Sale
from app.models.waste_log_model import WasteLog


class DashboardRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def count_ingredients(self, user_id: int) -> int:
        stmt = select(func.count(Ingredient.id)).where(Ingredient.user_id == user_id)
        return int((await self.db.execute(stmt)).scalar_one() or 0)

    async def active_products(self, user_id: int) -> list[Product]:
        stmt = select(Product).where(Product.user_id == user_id, Product.active.is_(True)).order_by(Product.id)
        return list((await self.db.execute(stmt)).scalars().all())

    async def history_days(self, user_id: int) -> int:
        stmt = select(func.count(func.distinct(Sale.date))).where(Sale.user_id == user_id)
        return int((await self.db.execute(stmt)).scalar_one() or 0)

    async def waste_cost(self, user_id: int, start: date, end: date) -> float:
        """Biaya limbah (qty x harga bahan) pada rentang [start, end)."""
        stmt = (
            select(func.coalesce(func.sum(WasteLog.qty * Ingredient.price), 0.0))
            .join(Ingredient, Ingredient.id == WasteLog.ingredient_id)
            .where(WasteLog.user_id == user_id, WasteLog.date >= start, WasteLog.date < end)
        )
        return float((await self.db.execute(stmt)).scalar_one() or 0.0)

    async def usable_stock(self, user_id: int, today: date) -> dict[int, float]:
        stmt = (
            select(Batch.ingredient_id, func.sum(Batch.qty))
            .where(Batch.user_id == user_id, Batch.qty > 0, Batch.expiry_date >= today)
            .group_by(Batch.ingredient_id)
        )
        return {int(i): float(q or 0.0) for i, q in (await self.db.execute(stmt)).all()}

    async def recipes_for(self, product_ids: list[int]) -> dict[int, list[Recipe]]:
        result: dict[int, list[Recipe]] = {}
        if not product_ids:
            return result
        rows = (await self.db.execute(select(Recipe).where(Recipe.product_id.in_(product_ids)))).scalars().all()
        for row in rows:
            result.setdefault(row.product_id, []).append(row)
        return result

