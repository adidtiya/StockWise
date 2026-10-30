from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.event.repository import EventRepository
from app.api.event.schema import (
    EventCreateRequest,
    EventListResponse,
    EventResponse,
    EventUpdateRequest,
)
from app.api.exceptions.exceptions import BadRequestException, EventNotFoundException
from app.models.event_model import Event


def _to_event_response(event: Event) -> EventResponse:
    return EventResponse(
        id=event.id,
        name=event.name,
        date=event.date,
        impact=float(event.impact),
        category=event.category,
    )


class EventUseCases:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = EventRepository(db)

    async def list_events(
        self,
        user_id: int,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> EventListResponse:
        rows, total = await self.repo.list_by_user(
            user_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        return EventListResponse(
            items=[_to_event_response(e) for e in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create_event(
        self,
        user_id: int,
        payload: EventCreateRequest,
    ) -> EventResponse:
        if payload.impact <= 0:
            raise BadRequestException("Angka dampak pengali (impact) harus lebih dari 0")
        event = await self.repo.create(
            user_id=user_id,
            name=payload.name,
            event_date=payload.date,
            impact=payload.impact,
            category=payload.category,
        )
        return _to_event_response(event)

    async def update_event(
        self,
        user_id: int,
        event_id: int,
        payload: EventUpdateRequest,
    ) -> EventResponse:
        event = await self.repo.get_by_id_and_user(event_id, user_id)
        if event is None:
            raise EventNotFoundException()
        if payload.impact is not None and payload.impact <= 0:
            raise BadRequestException("Angka dampak pengali (impact) harus lebih dari 0")

        updated = await self.repo.update(
            event,
            name=payload.name,
            event_date=payload.date,
            impact=payload.impact,
            category=payload.category,
        )
        return _to_event_response(updated)

    async def delete_event(self, user_id: int, event_id: int) -> None:
        event = await self.repo.get_by_id_and_user(event_id, user_id)
        if event is None:
            raise EventNotFoundException()
        await self.repo.delete(event)

