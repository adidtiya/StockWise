from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch_model import Batch
from app.models.ingredient_model import Ingredient


class BatchRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_ingredient_by_id_and_user(
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

    async def get_by_id_and_user(
        self,
        batch_id: int,
        user_id: int,
    ) -> Optional[Batch]:
        stmt = select(Batch).where(
            Batch.id == batch_id,
            Batch.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(
        self,
        user_id: int,
        *,
        ingredient_id: Optional[int] = None,
        active_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[tuple[Batch, Ingredient]], int]:
        today = date.today()

        count_stmt = select(func.count(Batch.id)).where(Batch.user_id == user_id)
        if ingredient_id is not None:
            count_stmt = count_stmt.where(Batch.ingredient_id == ingredient_id)
        if active_only:
            count_stmt = count_stmt.where(Batch.qty > 0, Batch.expiry_date >= today)
        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)

        stmt = (
            select(Batch, Ingredient)
            .join(Ingredient, Ingredient.id == Batch.ingredient_id)
            .where(Batch.user_id == user_id)
        )
        if ingredient_id is not None:
            stmt = stmt.where(Batch.ingredient_id == ingredient_id)
        if active_only:
            stmt = stmt.where(Batch.qty > 0, Batch.expiry_date >= today)

        # FEFO default ordering: expiry_date ASC, id ASC
        stmt = stmt.order_by(Batch.expiry_date.asc(), Batch.id.asc()).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).all())
        return rows, total

    async def create(
        self,
        *,
        user_id: int,
        ingredient_id: int,
        qty: float,
        unit_price: Optional[float],
        received_date: date,
        expiry_date: date,
        source: str = "manual",
    ) -> Batch:
        batch = Batch(
            user_id=user_id,
            ingredient_id=ingredient_id,
            qty=qty,
            unit_price=unit_price,
            received_date=received_date,
            expiry_date=expiry_date,
            source=source,
        )
        self.db.add(batch)
        await self.db.commit()
        await self.db.refresh(batch)
        return batch

    async def delete(self, batch: Batch) -> None:
        await self.db.delete(batch)
        await self.db.commit()

