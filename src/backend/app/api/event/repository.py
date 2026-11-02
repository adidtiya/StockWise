from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_model import Event


class EventRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id_and_user(
        self,
        event_id: int,
        user_id: int,
    ) -> Optional[Event]:
        stmt = select(Event).where(
            Event.id == event_id,
            Event.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(
        self,
        user_id: int,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Event], int]:
        count_stmt = select(func.count(Event.id)).where(Event.user_id == user_id)
        if start_date is not None:
            count_stmt = count_stmt.where(Event.date >= start_date)
        if end_date is not None:
            count_stmt = count_stmt.where(Event.date <= end_date)
        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)

        stmt = select(Event).where(Event.user_id == user_id)
        if start_date is not None:
            stmt = stmt.where(Event.date >= start_date)
        if end_date is not None:
            stmt = stmt.where(Event.date <= end_date)
        stmt = stmt.order_by(Event.date.asc(), Event.id.asc()).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).scalars().all())
        return rows, total

    async def create(
        self,
        *,
        user_id: int,
        name: str,
        event_date: date,
        impact: float,
        category: str,
    ) -> Event:
        event = Event(
            user_id=user_id,
            name=name,
            date=event_date,
            impact=impact,
            category=category,
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def update(
        self,
        event: Event,
        *,
        name: Optional[str] = None,
        event_date: Optional[date] = None,
        impact: Optional[float] = None,
        category: Optional[str] = None,
    ) -> Event:
        if name is not None:
            event.name = name
        if event_date is not None:
            event.date = event_date
        if impact is not None:
            event.impact = impact
        if category is not None:
            event.category = category

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def delete(self, event: Event) -> None:
        await self.db.delete(event)
        await self.db.commit()

