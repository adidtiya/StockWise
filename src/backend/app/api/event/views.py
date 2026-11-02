from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.event.schema import (
    EventCreateRequest,
    EventListResponse,
    EventResponse,
    EventUpdateRequest,
)
from app.api.event.use_cases import EventUseCases
from app.api.standard_response import StandardResponse, create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get(
    "",
    response_model=StandardResponse[EventListResponse],
    status_code=status.HTTP_200_OK,
    summary="Daftar event hari khusus pengguna",
)
async def list_events(
    start_date: Optional[date] = Query(default=None, alias="from", description="Filter tanggal mulai"),
    end_date: Optional[date] = Query(default=None, alias="to", description="Filter tanggal akhir"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[EventListResponse]:
    use_cases = EventUseCases(db)
    data = await use_cases.list_events(
        current_user.id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.post(
    "",
    response_model=StandardResponse[EventResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Tambah event hari khusus baru",
)
async def create_event(
    payload: EventCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[EventResponse]:
    use_cases = EventUseCases(db)
    data = await use_cases.create_event(current_user.id, payload)
    return create_success_response(data=data)


@router.put(
    "/{event_id}",
    response_model=StandardResponse[EventResponse],
    status_code=status.HTTP_200_OK,
    summary="Perbarui event hari khusus (PUT)",
)
@router.patch(
    "/{event_id}",
    response_model=StandardResponse[EventResponse],
    status_code=status.HTTP_200_OK,
    summary="Perbarui event hari khusus (PATCH)",
)
async def update_event(
    event_id: int,
    payload: EventUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[EventResponse]:
    use_cases = EventUseCases(db)
    data = await use_cases.update_event(current_user.id, event_id, payload)
    return create_success_response(data=data)


@router.delete(
    "/{event_id}",
    response_model=StandardResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Hapus event hari khusus",
)
async def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[None]:
    use_cases = EventUseCases(db)
    await use_cases.delete_event(current_user.id, event_id)
    return create_success_response(data=None)

