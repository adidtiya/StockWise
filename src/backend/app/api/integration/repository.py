from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration_model import Integration
from app.models.product_model import Product
from app.models.sale_model import Sale


class IntegrationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_user(self, user_id: int) -> list[Integration]:
        stmt = select(Integration).where(Integration.user_id == user_id)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get(self, user_id: int, provider: str) -> Integration | None:
        stmt = select(Integration).where(Integration.user_id == user_id, Integration.provider == provider)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def upsert(self, user_id: int, provider: str, api_key: str) -> Integration:
        row = await self.get(user_id, provider)
        now = datetime.now(timezone.utc)
        if row is None:
            row = Integration(user_id=user_id, provider=provider, api_key=api_key, connected_at=now)
            self.db.add(row)
        else:
            row.api_key = api_key
            row.connected_at = now
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def active_product_ids(self, user_id: int) -> list[int]:
        stmt = select(Product.id).where(Product.user_id == user_id, Product.active.is_(True)).order_by(Product.id)
        return list((await self.db.execute(stmt)).scalars().all())

    async def add_sales(self, user_id: int, rows: list[tuple[int, int]], sale_date: date, source: str) -> None:
        for product_id, qty in rows:
            self.db.add(Sale(user_id=user_id, product_id=product_id, qty=qty, date=sale_date, source=source))

    async def mark_synced(self, row: Integration) -> Integration:
        row.last_sync = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(row)
        return row

