from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.product.schema import (
    ProductCreateRequest,
    ProductListResponse,
    ProductResponse,
    ProductUpdateRequest,
)
from app.api.product.use_cases import ProductUseCases
from app.api.standard_response import StandardResponse, create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get(
    "",
    response_model=StandardResponse[ProductListResponse],
    status_code=status.HTTP_200_OK,
    summary="Daftar produk beserta komposisi resepnya",
)
async def list_products(
    active: Optional[bool] = Query(default=True, description="Filter status aktif produk"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProductListResponse]:
    use_cases = ProductUseCases(db)
    data = await use_cases.list_products(
        current_user.id,
        active=active,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.post(
    "",
    response_model=StandardResponse[ProductResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Tambah menu produk & resep baru",
)
async def create_product(
    payload: ProductCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProductResponse]:
    use_cases = ProductUseCases(db)
    data = await use_cases.create_product(current_user.id, payload)
    return create_success_response(data=data)


@router.get(
    "/{product_id}",
    response_model=StandardResponse[ProductResponse],
    status_code=status.HTTP_200_OK,
    summary="Detail produk dan resep",
)
async def get_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProductResponse]:
    use_cases = ProductUseCases(db)
    data = await use_cases.get_product(current_user.id, product_id)
    return create_success_response(data=data)


@router.put(
    "/{product_id}",
    response_model=StandardResponse[ProductResponse],
    status_code=status.HTTP_200_OK,
    summary="Perbarui produk dan resepnya (PUT)",
)
@router.patch(
    "/{product_id}",
    response_model=StandardResponse[ProductResponse],
    status_code=status.HTTP_200_OK,
    summary="Perbarui produk dan resepnya (PATCH)",
)
async def update_product(
    product_id: int,
    payload: ProductUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProductResponse]:
    use_cases = ProductUseCases(db)
    data = await use_cases.update_product(current_user.id, product_id, payload)
    return create_success_response(data=data)


@router.delete(
    "/{product_id}",
    response_model=StandardResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Nonaktifkan atau hapus produk",
)
async def delete_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[None]:
    use_cases = ProductUseCases(db)
    await use_cases.delete_product(current_user.id, product_id)
    return create_success_response(data=None)

