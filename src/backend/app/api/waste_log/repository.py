from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient_model import Ingredient
from app.models.waste_log_model import WasteLog


class WasteLogRepository:
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
        waste_id: int,
        user_id: int,
    ) -> Optional[WasteLog]:
        stmt = select(WasteLog).where(
            WasteLog.id == waste_id,
            WasteLog.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(
        self,
        user_id: int,
        *,
        ingredient_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[tuple[WasteLog, Ingredient]], int]:
        count_stmt = select(func.count(WasteLog.id)).where(WasteLog.user_id == user_id)
        if ingredient_id is not None:
            count_stmt = count_stmt.where(WasteLog.ingredient_id == ingredient_id)
        if start_date is not None:
            count_stmt = count_stmt.where(WasteLog.date >= start_date)
        if end_date is not None:
            count_stmt = count_stmt.where(WasteLog.date <= end_date)
        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)

        stmt = (
            select(WasteLog, Ingredient)
            .join(Ingredient, Ingredient.id == WasteLog.ingredient_id)
            .where(WasteLog.user_id == user_id)
        )
        if ingredient_id is not None:
            stmt = stmt.where(WasteLog.ingredient_id == ingredient_id)
        if start_date is not None:
            stmt = stmt.where(WasteLog.date >= start_date)
        if end_date is not None:
            stmt = stmt.where(WasteLog.date <= end_date)

        stmt = stmt.order_by(WasteLog.date.desc(), WasteLog.id.desc()).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).all())
        return rows, total

    async def create(
        self,
        *,
        user_id: int,
        ingredient_id: int,
        qty: float,
        waste_date: date,
        reason: str,
    ) -> WasteLog:
        waste = WasteLog(
            user_id=user_id,
            ingredient_id=ingredient_id,
            qty=qty,
            date=waste_date,
            reason=reason,
        )
        self.db.add(waste)
        await self.db.commit()
        await self.db.refresh(waste)
        return waste

    async def delete(self, waste_log: WasteLog) -> None:
        await self.db.delete(waste_log)
        await self.db.commit()

