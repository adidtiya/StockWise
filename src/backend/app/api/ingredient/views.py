from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.ingredient.schema import (
    IngredientCreateRequest,
    IngredientListResponse,
    IngredientResponse,
    IngredientUpdateRequest,
)
from app.api.ingredient.use_cases import IngredientUseCases
from app.api.standard_response import StandardResponse, create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get(
    "",
    response_model=StandardResponse[IngredientListResponse],
    status_code=status.HTTP_200_OK,
    summary="Daftar semua bahan baku milik pengguna",
)
async def list_ingredients(
    category: Optional[str] = Query(default=None, description="Filter kategori: segar | tahan_lama"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[IngredientListResponse]:
    use_cases = IngredientUseCases(db)
    data = await use_cases.list_ingredients(
        current_user.id,
        category=category,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.post(
    "",
    response_model=StandardResponse[IngredientResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Tambah bahan baku baru",
)
async def create_ingredient(
    payload: IngredientCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[IngredientResponse]:
    use_cases = IngredientUseCases(db)
    data = await use_cases.create_ingredient(current_user.id, payload)
    return create_success_response(data=data)


@router.get(
    "/{ingredient_id}",
    response_model=StandardResponse[IngredientResponse],
    status_code=status.HTTP_200_OK,
    summary="Detail bahan baku",
)
async def get_ingredient(
    ingredient_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[IngredientResponse]:
    use_cases = IngredientUseCases(db)
    data = await use_cases.get_ingredient(current_user.id, ingredient_id)
    return create_success_response(data=data)


@router.put(
    "/{ingredient_id}",
    response_model=StandardResponse[IngredientResponse],
    status_code=status.HTTP_200_OK,
    summary="Perbarui bahan baku (PUT)",
)
@router.patch(
    "/{ingredient_id}",
    response_model=StandardResponse[IngredientResponse],
    status_code=status.HTTP_200_OK,
    summary="Perbarui bahan baku (PATCH)",
)
async def update_ingredient(
    ingredient_id: int,
    payload: IngredientUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[IngredientResponse]:
    use_cases = IngredientUseCases(db)
    data = await use_cases.update_ingredient(current_user.id, ingredient_id, payload)
    return create_success_response(data=data)


@router.delete(
    "/{ingredient_id}",
    response_model=StandardResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Hapus bahan baku",
)
async def delete_ingredient(
    ingredient_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[None]:
    use_cases = IngredientUseCases(db)
    await use_cases.delete_ingredient(current_user.id, ingredient_id)
    return create_success_response(data=None)

