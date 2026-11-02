from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.standard_response import StandardResponse, create_success_response
from app.api.waste_log.schema import (
    WasteLogCreateRequest,
    WasteLogListResponse,
    WasteLogResponse,
)
from app.api.waste_log.use_cases import WasteLogUseCases
from app.models.user_model import User

router = APIRouter()


@router.get(
    "",
    response_model=StandardResponse[WasteLogListResponse],
    status_code=status.HTTP_200_OK,
    summary="Daftar histori limbah bahan baku pengguna",
)
async def list_waste_logs(
    ingredient_id: Optional[int] = Query(default=None, description="Filter ID bahan baku"),
    start_date: Optional[date] = Query(default=None, description="Filter tanggal awal"),
    end_date: Optional[date] = Query(default=None, description="Filter tanggal akhir"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[WasteLogListResponse]:
    use_cases = WasteLogUseCases(db)
    data = await use_cases.list_waste_logs(
        current_user.id,
        ingredient_id=ingredient_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.post(
    "",
    response_model=StandardResponse[WasteLogResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Catat insiden bahan terbuang manual",
)
async def create_waste_log(
    payload: WasteLogCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[WasteLogResponse]:
    use_cases = WasteLogUseCases(db)
    data = await use_cases.create_waste_log(current_user.id, payload)
    return create_success_response(data=data)


@router.delete(
    "/{waste_id}",
    response_model=StandardResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Hapus catatan limbah",
)
async def delete_waste_log(
    waste_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[None]:
    use_cases = WasteLogUseCases(db)
    await use_cases.delete_waste_log(current_user.id, waste_id)
    return create_success_response(data=None)

