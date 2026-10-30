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


class RecommendationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def load_inventory_context(self, user_id: int, on_date: date) -> dict:
        ingredients = list((await self.db.execute(
            select(Ingredient).where(Ingredient.user_id == user_id).order_by(Ingredient.name, Ingredient.id)
        )).scalars().all())

        batches = list((await self.db.execute(
            select(Batch).where(Batch.user_id == user_id, Batch.received_date <= on_date)
            .order_by(Batch.received_date.asc(), Batch.id.asc())
        )).scalars().all())

        sales = list((await self.db.execute(
            select(Sale.product_id, Sale.date, func.sum(Sale.qty).label("qty"))
            .where(Sale.user_id == user_id, Sale.date <= on_date)
            .group_by(Sale.product_id, Sale.date)
            .order_by(Sale.date.asc())
        )).all())

        waste_logs = list((await self.db.execute(
            select(WasteLog).where(WasteLog.user_id == user_id, WasteLog.date <= on_date)
            .order_by(WasteLog.date.asc(), WasteLog.id.asc())
        )).scalars().all())

        product_ids = list((await self.db.execute(
            select(Product.id).where(Product.user_id == user_id)
        )).scalars().all())

        recipes: dict[int, list[dict]] = {}
        if product_ids:
            recipe_rows = list((await self.db.execute(
                select(Recipe).where(Recipe.product_id.in_(product_ids))
            )).scalars().all())
            for r in recipe_rows:
                recipes.setdefault(r.product_id, []).append({
                    "ingredient_id": r.ingredient_id,
                    "qty": float(r.qty),
                })

        today_sold = {
            int(row.product_id): int(row.qty)
            for row in sales
            if row.date == on_date
        }

        return {
            "ingredients": ingredients,
            "recipes": recipes,
            "batches": batches,
            "sales": sales,
            "waste_logs": waste_logs,
            "today_sold": today_sold,
        }
