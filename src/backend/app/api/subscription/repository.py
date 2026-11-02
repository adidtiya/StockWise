from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_model import Payment
from app.models.user_model import User


class SubscriptionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_payments(self, user_id: int) -> list[Payment]:
        stmt = select(Payment).where(Payment.user_id == user_id).order_by(Payment.id.desc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def create_payment(self, user: User, *, amount: int, method: str, period_start, period_end) -> Payment:
        payment = Payment(user_id=user.id, plan="pro", amount=amount, method=method, status="completed",
                          period_start=period_start, period_end=period_end)
        self.db.add(payment)
        await self.db.flush()
        return payment

    async def set_plan(self, user: User, *, role: str, pro_until) -> User:
        user.role = role
        user.pro_until = pro_until
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def commit(self) -> None:
        await self.db.commit()

