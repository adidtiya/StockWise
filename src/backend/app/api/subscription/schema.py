from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

PaymentMethod = Literal["qris", "va_bca", "va_mandiri", "gopay"]


class PaymentItem(BaseModel):
    order_id: str
    amount: int
    method: str
    status: str
    period_start: date
    period_end: date
    created_at: Optional[datetime] = None


class SubscriptionStatusResponse(BaseModel):
    role: str
    pro_until: Optional[date] = None
    price_monthly: int
    methods: list[str]
    payments: list[PaymentItem]


class CheckoutRequest(BaseModel):
    method: PaymentMethod
    months: int = Field(default=1, ge=1, le=12)


class CheckoutResponse(BaseModel):
    order_id: str
    amount: int
    status: str
    pro_until: date
    payment_simulation: bool


class CancelResponse(BaseModel):
    role: str
    message: str

