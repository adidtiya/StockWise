from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.subscription.repository import SubscriptionRepository
from app.api.subscription.schema import CheckoutRequest
from app.models.payment_model import Payment

WIB = ZoneInfo("Asia/Jakarta")
PRICE_MONTHLY = 100_000
METHODS = ["qris", "va_bca", "va_mandiri", "gopay"]


def _order_id(payment: Payment) -> str:
    return f"SUB-{payment.period_start:%Y%m%d}-{payment.id:03d}"


class SubscriptionUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = SubscriptionRepository(db)

    async def get_status(self, user) -> dict:
        payments = await self.repo.list_payments(user.id)
        return {
            "role": user.role,
            "pro_until": user.pro_until,
            "price_monthly": PRICE_MONTHLY,
            "methods": METHODS,
            "payments": [{"order_id": _order_id(p), "amount": p.amount, "method": p.method, "status": p.status,
                          "period_start": p.period_start, "period_end": p.period_end, "created_at": p.created_at}
                         for p in payments],
        }

    async def checkout_simulation(self, user, body: CheckoutRequest) -> dict:
        today = datetime.now(WIB).date()
        # Perpanjang dari masa aktif yang tersisa bila masih Pro, jika tidak mulai hari ini.
        base = user.pro_until if user.role == "pro" and user.pro_until and user.pro_until > today else today
        period_end = base + timedelta(days=30 * body.months)
        amount = PRICE_MONTHLY * body.months
        payment = await self.repo.create_payment(user, amount=amount, method=body.method,
                                                 period_start=today, period_end=period_end)
        await self.repo.set_plan(user, role="pro", pro_until=period_end)
        return {"order_id": _order_id(payment), "amount": amount, "status": "active",
                "pro_until": period_end, "payment_simulation": True}

    async def cancel_subscription(self, user) -> dict:
        await self.repo.set_plan(user, role="freemium", pro_until=None)
        return {"role": "freemium", "message": "Langganan Pro berhasil dibatalkan"}

