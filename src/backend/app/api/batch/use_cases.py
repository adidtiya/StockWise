from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.batch.repository import BatchRepository
from app.api.batch.schema import (
    BatchCreateRequest,
    BatchListResponse,
    BatchPurchaseRequest,
    BatchPurchaseResponse,
    BatchResponse,
)
from app.api.exceptions.exceptions import (
    BadRequestException,
    BatchNotFoundException,
    IngredientNotFoundException,
)
from app.models.batch_model import Batch
from app.models.ingredient_model import Ingredient


def _to_batch_response(batch: Batch, ingredient: Optional[Ingredient] = None) -> BatchResponse:
    return BatchResponse(
        id=batch.id,
        ingredient_id=batch.ingredient_id,
        ingredient_name=ingredient.name if ingredient else None,
        unit=ingredient.unit if ingredient else None,
        qty=float(batch.qty),
        unit_price=float(batch.unit_price) if batch.unit_price is not None else None,
        received_date=batch.received_date,
        expiry_date=batch.expiry_date,
        source=batch.source,
        created_at=batch.created_at,
    )


class BatchUseCases:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = BatchRepository(db)

    async def list_batches(
        self,
        user_id: int,
        *,
        ingredient_id: Optional[int] = None,
        status: Optional[str] = None,
        active_only: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> BatchListResponse:
        is_active_only = bool(active_only) or (status is not None and status.strip().lower() == "active")
        rows, total = await self.repo.list_by_user(
            user_id,
            ingredient_id=ingredient_id,
            active_only=is_active_only,
            limit=limit,
            offset=offset,
        )
        items = [_to_batch_response(batch, ing) for batch, ing in rows]
        return BatchListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create_batch(
        self,
        user_id: int,
        payload: BatchCreateRequest,
    ) -> BatchResponse:
        ingredient = await self.repo.get_ingredient_by_id_and_user(
            payload.ingredient_id,
            user_id,
        )
        if ingredient is None:
            raise IngredientNotFoundException()

        received = payload.received_date or date.today()
        expiry = payload.expiry_date or (received + timedelta(days=int(ingredient.shelf_life_days)))

        if expiry < received:
            raise BadRequestException(
                "Tanggal kedaluwarsa tidak boleh lebih awal dari tanggal penerimaan"
            )

        unit_price = payload.unit_price if payload.unit_price is not None else float(ingredient.price)
        batch = await self.repo.create(
            user_id=user_id,
            ingredient_id=ingredient.id,
            qty=payload.qty,
            unit_price=unit_price,
            received_date=received,
            expiry_date=expiry,
            source=payload.source or "manual",
        )
        return _to_batch_response(batch, ingredient)

    async def purchase_batches(
        self,
        user_id: int,
        payload: BatchPurchaseRequest,
    ) -> BatchPurchaseResponse:
        created_batches: list[BatchResponse] = []
        for item in payload.items:
            if not item.source or item.source == "manual":
                item.source = "rekomendasi"
            created = await self.create_batch(user_id, item)
            created_batches.append(created)
        return BatchPurchaseResponse(
            created_count=len(created_batches),
            batches=created_batches,
        )

    async def delete_batch(self, user_id: int, batch_id: int) -> None:
        batch = await self.repo.get_by_id_and_user(batch_id, user_id)
        if batch is None:
            raise BatchNotFoundException()
        await self.repo.delete(batch)

