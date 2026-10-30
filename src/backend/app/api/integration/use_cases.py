from __future__ import annotations

import random
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions import IntegrationNotConnectedException, ProviderNotFoundException
from app.api.integration.repository import IntegrationRepository

WIB = ZoneInfo("Asia/Jakarta")
PROVIDERS = {
    "mokapos": "Moka POS",
    "gofood": "GoFood (GoBiz)",
    "grabfood": "GrabFood (GrabMerchant)",
    "shopeefood": "ShopeeFood (Shopee Partner)",
}
MOCK_ORDERS_PER_SYNC = 8


def _ensure_provider(provider: str) -> None:
    if provider not in PROVIDERS:
        raise ProviderNotFoundException()


class IntegrationUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = IntegrationRepository(db)

    async def list_status(self, user) -> dict:
        rows = {r.provider: r for r in await self.repo.list_by_user(user.id)}
        return {"providers": [
            {"name": name, "label": label, "connected": name in rows,
             "last_sync": rows[name].last_sync if name in rows else None}
            for name, label in PROVIDERS.items()
        ]}

    async def connect_provider(self, user, provider: str, api_key: str) -> dict:
        _ensure_provider(provider)
        row = await self.repo.upsert(user.id, provider, api_key)
        return {"provider": provider, "connected": True, "connected_at": row.connected_at}

    async def sync_provider(self, user, provider: str) -> dict:
        _ensure_provider(provider)
        row = await self.repo.get(user.id, provider)
        if row is None:
            raise IntegrationNotConnectedException(f"Layanan {provider} belum terhubung. Hubungkan akun terlebih dahulu.")
        product_ids = await self.repo.active_product_ids(user.id)
        orders = [(random.choice(product_ids), random.randint(1, 3)) for _ in range(MOCK_ORDERS_PER_SYNC)] if product_ids else []
        await self.repo.add_sales(user.id, orders, datetime.now(WIB).date(), provider)
        row = await self.repo.mark_synced(row)
        return {"provider": provider, "synced_orders": len(orders), "last_sync": row.last_sync}

