from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class DashboardCounts(BaseModel):
    products: int
    ingredients: int
    history_days: int


class DashboardWaste(BaseModel):
    current_month_cost: float
    previous_month_cost: float
    reduction_percentage: float


class DashboardRisk(BaseModel):
    high: int
    medium: int
    low: int


class DashboardBuy(BaseModel):
    items_to_buy: int
    estimated_total_cost: float


class DashboardPortion(BaseModel):
    product_id: int
    product_name: str
    remaining_portions: int


class DashboardData(BaseModel):
    date: date
    counts: DashboardCounts
    waste: DashboardWaste
    risk: DashboardRisk
    buy: DashboardBuy
    portions: list[DashboardPortion]

