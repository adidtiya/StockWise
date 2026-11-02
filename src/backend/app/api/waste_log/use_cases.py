from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions.exceptions import (
    BadRequestException,
    IngredientNotFoundException,
    WasteLogNotFoundException,
)
from app.api.waste_log.repository import WasteLogRepository
from app.api.waste_log.schema import (
    WasteLogCreateRequest,
    WasteLogListResponse,
    WasteLogResponse,
)
from app.models.ingredient_model import Ingredient
from app.models.waste_log_model import WasteLog


def _to_waste_response(waste: WasteLog, ingredient: Optional[Ingredient] = None) -> WasteLogResponse:
    value = round(float(waste.qty) * float(ingredient.price), 2) if ingredient is not None else None
    return WasteLogResponse(
        id=waste.id,
        ingredient_id=waste.ingredient_id,
        ingredient_name=ingredient.name if ingredient else None,
        unit=ingredient.unit if ingredient else None,
        qty=float(waste.qty),
        date=waste.date,
        reason=waste.reason,
        value=value,
    )


class WasteLogUseCases:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = WasteLogRepository(db)

    async def list_waste_logs(
        self,
        user_id: int,
        *,
        ingredient_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> WasteLogListResponse:
        rows, total = await self.repo.list_by_user(
            user_id,
            ingredient_id=ingredient_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        items = [_to_waste_response(w, ing) for w, ing in rows]
        return WasteLogListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create_waste_log(
        self,
        user_id: int,
        payload: WasteLogCreateRequest,
    ) -> WasteLogResponse:
        if payload.qty <= 0:
            raise BadRequestException("Kuantitas limbah harus lebih dari 0")
        reason = payload.reason.strip()
        if not reason:
            raise BadRequestException("Alasan limbah tidak boleh kosong")

        ingredient = await self.repo.get_ingredient_by_id_and_user(
            payload.ingredient_id,
            user_id,
        )
        if ingredient is None:
            raise IngredientNotFoundException()

        waste_date = payload.date or date.today()
        waste = await self.repo.create(
            user_id=user_id,
            ingredient_id=ingredient.id,
            qty=payload.qty,
            waste_date=waste_date,
            reason=reason,
        )
        return _to_waste_response(waste, ingredient)

    async def delete_waste_log(self, user_id: int, waste_id: int) -> None:
        waste = await self.repo.get_by_id_and_user(waste_id, user_id)
        if waste is None:
            raise WasteLogNotFoundException()
        await self.repo.delete(waste)

