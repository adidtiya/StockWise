from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.batch.schema import (
    BatchCreateRequest,
    BatchListResponse,
    BatchPurchaseRequest,
    BatchPurchaseResponse,
    BatchResponse,
)
from app.api.batch.use_cases import BatchUseCases
from app.api.depedencies import get_current_user, get_db
from app.api.standard_response import StandardResponse, create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get(
    "",
    response_model=StandardResponse[BatchListResponse],
    status_code=status.HTTP_200_OK,
    summary="Daftar stok batch bahan baku (FEFO)",
)
async def list_batches(
    ingredient_id: Optional[int] = Query(default=None, description="Filter berdasarkan ID bahan baku"),
    batch_status: Optional[str] = Query(default=None, alias="status", description="Filter status: active"),
    active_only: Optional[bool] = Query(default=None, description="Filter hanya batch aktif (belum kedaluwarsa)"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[BatchListResponse]:
    use_cases = BatchUseCases(db)
    data = await use_cases.list_batches(
        current_user.id,
        ingredient_id=ingredient_id,
        status=batch_status,
        active_only=active_only,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.post(
    "",
    response_model=StandardResponse[BatchResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Catat stok bahan masuk baru",
)
async def create_batch(
    payload: BatchCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[BatchResponse]:
    use_cases = BatchUseCases(db)
    data = await use_cases.create_batch(current_user.id, payload)
    return create_success_response(data=data)


@router.post(
    "/purchase",
    response_model=StandardResponse[BatchPurchaseResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Pembelian massal dari rekomendasi (Mark as Purchased)",
)
async def purchase_batches(
    payload: BatchPurchaseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[BatchPurchaseResponse]:
    use_cases = BatchUseCases(db)
    data = await use_cases.purchase_batches(current_user.id, payload)
    return create_success_response(data=data)


@router.delete(
    "/{batch_id}",
    response_model=StandardResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Hapus atau batalkan pencatatan batch",
)
async def delete_batch(
    batch_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[None]:
    use_cases = BatchUseCases(db)
    await use_cases.delete_batch(current_user.id, batch_id)
    return create_success_response(data=None)

