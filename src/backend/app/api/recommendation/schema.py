from __future__ import annotations

from datetime import date
from pydantic import BaseModel


class WasteRisk(BaseModel):
    level: str
    waste_qty: float
    waste_value: float
    ratio: float
    first_date: date | None = None
    safe_buy: float
    message: str | None = None


class RecommendationItem(BaseModel):
    id: int
    name: str
    unit: str
    category: str
    horizon: int
    period_label: str
    stock_now: float
    stock_start: float
    need: float
    need_lo: float
    need_hi: float
    buy: float
    buy_lo: float
    buy_hi: float
    buy_cost: int
    status: str
    risk: WasteRisk | None = None


class RecommendationData(BaseModel):
    date: date
    period_start: date
    items: list[RecommendationItem]
