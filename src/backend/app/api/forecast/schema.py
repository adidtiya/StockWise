from __future__ import annotations

from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class ForecastQuery(BaseModel):
    days: int = Field(default=7, description="Forecast horizon: 7, 14, or 30 days")
    view: str = "bahan"


class DailyNeed(BaseModel):
    date: date
    need: float
    need_lo: float
    need_hi: float


class IngredientForecast(BaseModel):
    id: int
    name: str
    category: str
    unit: str
    total_need: float
    need_lo: float
    need_hi: float
    daily_needs: list[DailyNeed]


class ForecastData(BaseModel):
    period_start: date
    period_end: date
    days_count: int
    ingredients: list[IngredientForecast]
    events: list[dict]
