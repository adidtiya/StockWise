from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_model import Event
from app.models.model_state_model import ModelState
from app.models.product_model import Product
from app.models.sale_model import Sale


class EvaluationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def sales_history(self, user_id: int, start_date: date, end_date: date) -> dict:
        products = list((await self.db.execute(
            select(Product).where(Product.user_id == user_id, Product.active.is_(True)).order_by(Product.id)
        )).scalars().all())
        product_ids = [product.id for product in products]
        rows = []
        if product_ids:
            rows = list((await self.db.execute(
                select(Sale.product_id, Sale.date, func.sum(Sale.qty).label("qty"))
                .where(Sale.user_id == user_id, Sale.product_id.in_(product_ids), Sale.date >= start_date, Sale.date < end_date)
                .group_by(Sale.product_id, Sale.date).order_by(Sale.date)
            )).all())
        state = (await self.db.execute(select(ModelState).where(ModelState.user_id == user_id))).scalar_one_or_none()

        events = list((await self.db.execute(
            select(Event).where(Event.user_id == user_id, Event.date >= start_date, Event.date <= end_date)
            .order_by(Event.date.asc())
        )).scalars().all())

        return {"products": products, "sales": rows, "state": state, "events": events}

    async def save_model_state(self, user_id: int, alpha: float, error: float | None, samples: int) -> ModelState:
        state = (await self.db.execute(select(ModelState).where(ModelState.user_id == user_id))).scalar_one_or_none()
        if state is None:
            state = ModelState(user_id=user_id, alpha=alpha, wape=error, samples=samples)
            self.db.add(state)
        else:
            state.alpha = alpha
            state.wape = error
            state.samples = samples
        await self.db.commit()
        await self.db.refresh(state)
        return state
