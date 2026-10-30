from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch_model import Batch
from app.models.event_model import Event
from app.models.ingredient_model import Ingredient
from app.models.product_model import Product
from app.models.recipe_model import Recipe
from app.models.sale_model import Sale
from app.models.waste_log_model import WasteLog


EPS = 1e-6


class SaleRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id_and_user(
        self,
        sale_id: int,
        user_id: int,
    ) -> Optional[Sale]:
        stmt = select(Sale).where(
            Sale.id == sale_id,
            Sale.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_products_by_ids(
        self,
        user_id: int,
        product_ids: list[int],
    ) -> dict[int, Product]:
        if not product_ids:
            return {}
        stmt = select(Product).where(
            Product.user_id == user_id,
            Product.id.in_(product_ids),
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return {p.id: p for p in rows}

    async def get_all_user_products(self, user_id: int) -> list[Product]:
        stmt = select(Product).where(Product.user_id == user_id).order_by(Product.name.asc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_recipes_for_products(
        self,
        product_ids: list[int],
    ) -> dict[int, list[Recipe]]:
        if not product_ids:
            return {}
        stmt = select(Recipe).where(Recipe.product_id.in_(product_ids))
        rows = (await self.db.execute(stmt)).scalars().all()
        grouped: dict[int, list[Recipe]] = {pid: [] for pid in product_ids}
        for rec in rows:
            grouped.setdefault(rec.product_id, []).append(rec)
        return grouped

    async def count_monthly_sales(self, user_id: int, ref_date: date) -> int:
        month_start = ref_date.replace(day=1)
        if ref_date.month == 12:
            next_month = ref_date.replace(year=ref_date.year + 1, month=1, day=1)
        else:
            next_month = ref_date.replace(month=ref_date.month + 1, day=1)

        stmt = select(func.count(Sale.id)).where(
            Sale.user_id == user_id,
            Sale.date >= month_start,
            Sale.date < next_month,
        )
        return int((await self.db.execute(stmt)).scalar_one() or 0)

    async def deduct_batches_fefo(
        self,
        user_id: int,
        ingredient_id: int,
        needed_qty: float,
        sale_date: date,
    ) -> None:
        if needed_qty <= EPS:
            return

        stmt = (
            select(Batch)
            .where(
                Batch.user_id == user_id,
                Batch.ingredient_id == ingredient_id,
                Batch.qty > 0,
                Batch.expiry_date >= sale_date,
            )
            .order_by(Batch.expiry_date.asc(), Batch.id.asc())
        )
        batches = list((await self.db.execute(stmt)).scalars().all())

        remaining_need = float(needed_qty)
        for batch in batches:
            if remaining_need <= EPS:
                break
            available = float(batch.qty)
            if available <= EPS:
                continue
            taken = min(available, remaining_need)
            new_qty = round(available - taken, 4)
            remaining_need = round(remaining_need - taken, 4)
            if new_qty <= EPS:
                await self.db.delete(batch)
            else:
                batch.qty = new_qty
                self.db.add(batch)

    async def create_sales_with_fefo(
        self,
        *,
        user_id: int,
        sale_date: date,
        source: str,
        items: list[tuple[Product, int]],
        recipes_map: dict[int, list[Recipe]],
    ) -> list[Sale]:
        created_sales: list[Sale] = []
        ingredient_needs: dict[int, float] = {}

        for product, qty in items:
            sale = Sale(
                user_id=user_id,
                product_id=product.id,
                qty=qty,
                date=sale_date,
                source=source,
            )
            self.db.add(sale)
            created_sales.append(sale)

            for rec in recipes_map.get(product.id, []):
                ingredient_needs[rec.ingredient_id] = (
                    ingredient_needs.get(rec.ingredient_id, 0.0) + float(qty) * float(rec.qty)
                )

        for ingredient_id, total_need in ingredient_needs.items():
            await self.deduct_batches_fefo(
                user_id=user_id,
                ingredient_id=ingredient_id,
                needed_qty=total_need,
                sale_date=sale_date,
            )

        await self.db.commit()
        for sale in created_sales:
            await self.db.refresh(sale)
        return created_sales

    async def list_by_user(
        self,
        user_id: int,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        source: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[tuple[Sale, Product]], int]:
        count_stmt = select(func.count(Sale.id)).where(Sale.user_id == user_id)
        if start_date is not None:
            count_stmt = count_stmt.where(Sale.date >= start_date)
        if end_date is not None:
            count_stmt = count_stmt.where(Sale.date <= end_date)
        if source is not None and source != "all":
            count_stmt = count_stmt.where(Sale.source == source)
        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)

        stmt = (
            select(Sale, Product)
            .join(Product, Product.id == Sale.product_id)
            .where(Sale.user_id == user_id)
        )
        if start_date is not None:
            stmt = stmt.where(Sale.date >= start_date)
        if end_date is not None:
            stmt = stmt.where(Sale.date <= end_date)
        if source is not None and source != "all":
            stmt = stmt.where(Sale.source == source)

        stmt = stmt.order_by(Sale.date.desc(), Sale.id.desc()).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).all())
        return rows, total

    async def get_events_in_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
    ) -> dict[str, list[str]]:
        stmt = (
            select(Event)
            .where(
                Event.user_id == user_id,
                Event.date >= start_date,
                Event.date <= end_date,
            )
            .order_by(Event.date.asc(), Event.id.asc())
        )
        events = list((await self.db.execute(stmt)).scalars().all())
        event_map: dict[str, list[str]] = {}
        for ev in events:
            key = ev.date.isoformat()
            event_map.setdefault(key, []).append(ev.name)
        return event_map

    async def list_batches_in_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
    ) -> list[tuple[Batch, Ingredient]]:
        stmt = (
            select(Batch, Ingredient)
            .join(Ingredient, Ingredient.id == Batch.ingredient_id)
            .where(
                Batch.user_id == user_id,
                Batch.received_date >= start_date,
                Batch.received_date <= end_date,
            )
            .order_by(Batch.received_date.desc(), Batch.id.desc())
        )
        return list((await self.db.execute(stmt)).all())

    async def list_waste_in_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
    ) -> list[tuple[WasteLog, Ingredient]]:
        stmt = (
            select(WasteLog, Ingredient)
            .join(Ingredient, Ingredient.id == WasteLog.ingredient_id)
            .where(
                WasteLog.user_id == user_id,
                WasteLog.date >= start_date,
                WasteLog.date <= end_date,
            )
            .order_by(WasteLog.date.desc(), WasteLog.id.desc())
        )
        return list((await self.db.execute(stmt)).all())

    async def delete(self, sale: Sale) -> None:
        await self.db.delete(sale)
        await self.db.commit()
