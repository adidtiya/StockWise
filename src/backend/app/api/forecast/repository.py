from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_model import Event
from app.models.ingredient_model import Ingredient
from app.models.product_model import Product
from app.models.recipe_model import Recipe
from app.models.sale_model import Sale


class ForecastRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def load_context(self, user_id: int, start_date: date, end_date: date) -> dict:
        products = list((await self.db.execute(
            select(Product).where(Product.user_id == user_id, Product.active.is_(True)).order_by(Product.id)
        )).scalars().all())
        product_ids = [product.id for product in products]
        sales_rows = []
        if product_ids:
            sales_rows = list((await self.db.execute(
                select(Sale.product_id, Sale.date, func.sum(Sale.qty).label("qty"))
                .where(Sale.user_id == user_id, Sale.product_id.in_(product_ids), Sale.date >= start_date, Sale.date < end_date)
                .group_by(Sale.product_id, Sale.date).order_by(Sale.date)
            )).all())
        recipes = {}
        if product_ids:
            recipe_rows = (await self.db.execute(
                select(Recipe).where(Recipe.product_id.in_(product_ids))
            )).scalars().all()
            for recipe in recipe_rows:
                recipes.setdefault(recipe.product_id, []).append({"ingredient_id": recipe.ingredient_id, "qty": float(recipe.qty)})
        ingredients = list((await self.db.execute(
            select(Ingredient).where(Ingredient.user_id == user_id).order_by(Ingredient.name, Ingredient.id)
        )).scalars().all())
        events = list((await self.db.execute(
            select(Event).where(Event.user_id == user_id, Event.date >= start_date).order_by(Event.date, Event.id)
        )).scalars().all())
        distinct_sales_days = len({row.date for row in sales_rows})
        return {"products": products, "sales": sales_rows, "recipes": recipes,
                "ingredients": ingredients, "events": events, "history_days": distinct_sales_days}
