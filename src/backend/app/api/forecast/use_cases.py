from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.exceptions import InsufficientHistoryException, ProPlanRequiredException
from app.api.forecast.repository import ForecastRepository
from app.api.forecast.schema import ForecastData
from app.lib.forecast_math import forecast_series, ingredient_needs

WIB = ZoneInfo("Asia/Jakarta")
HORIZONS = {7, 14, 30}


class ForecastUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = ForecastRepository(db)

    async def execute(self, user, *, days: int = 7, view: str = "bahan", internal: bool = False) -> dict:
        if days not in HORIZONS and not (internal and 1 <= days <= 90):
            raise ValueError("days harus salah satu dari 7, 14, atau 30")
        if days > 7 and user.role != "pro" and not internal:
            raise ProPlanRequiredException("Peramalan 14 dan 30 hari hanya tersedia pada paket Pro")

        today = datetime.now(WIB).date()
        history_start = today - timedelta(days=120)
        context = await self.repo.load_context(user.id, history_start, today)
        if context["history_days"] < 14:
            raise InsufficientHistoryException()

        dates = [history_start + timedelta(days=i) for i in range((today - history_start).days)]
        events_by_date: dict[date, list[dict]] = {}
        for event in context["events"]:
            events_by_date.setdefault(event.date, []).append({"name": event.name, "impact": float(event.impact)})

        sales_by_product: dict[int, dict[date, float]] = {product.id: {} for product in context["products"]}
        for row in context["sales"]:
            sales_by_product.setdefault(row.product_id, {})[row.date] = float(row.qty)

        # Period for prediction: starting from tomorrow (T+1)
        start_date = today + timedelta(days=1)
        future_dates = [start_date + timedelta(days=i) for i in range(days)]
        all_forecast_dates = [today] + future_dates

        products = {}
        product_forecasts = {}
        for product in context["products"]:
            values = [sales_by_product.get(product.id, {}).get(day, 0.0) for day in dates]
            result = forecast_series(values, dates, all_forecast_dates, events=events_by_date)
            products[product.id] = result
            # For total_needs across the future period:
            future_preds = result["predictions"][1:]
            total = sum(future_preds)
            half = total * result["sigma"] / (len(future_preds) ** 0.5) if future_preds else 0.0
            product_forecasts[product.id] = {
                "total": total,
                "low": max(0.0, total - half),
                "high": total + half,
                "half": half,
            }

        needs_by_day: dict[date, dict[int, dict[str, float]]] = {}
        for day_index, forecast_date in enumerate(all_forecast_dates):
            day_forecasts = {}
            for product_id, result in products.items():
                day_total = result["predictions"][day_index]
                day_half = day_total * result["sigma"]
                day_forecasts[product_id] = {
                    "total": day_total,
                    "low": max(0.0, day_total - day_half),
                    "high": day_total + day_half,
                    "half": day_half,
                }
            needs_by_day[forecast_date] = ingredient_needs(day_forecasts, context["recipes"])

        total_needs = ingredient_needs(product_forecasts, context["recipes"])

        ingredient_rows = []
        for ingredient in context["ingredients"]:
            total = total_needs.get(ingredient.id, {"total": 0.0, "low": 0.0, "high": 0.0})
            daily = []
            for day in future_dates:
                need = needs_by_day[day].get(ingredient.id, {"total": 0.0, "low": 0.0, "high": 0.0})
                daily.append({
                    "date": day,
                    "need": round(need["total"], 4),
                    "need_lo": round(need["low"], 4),
                    "need_hi": round(need["high"], 4),
                })
            ingredient_rows.append({
                "id": ingredient.id,
                "name": ingredient.name,
                "category": ingredient.category,
                "unit": ingredient.unit,
                "total_need": round(total["total"], 4),
                "need_lo": round(total["low"], 4),
                "need_hi": round(total["high"], 4),
                "daily_needs": daily,
            })

        today_needs = {
            ingredient.id: needs_by_day[today].get(ingredient.id, {}).get("total", 0.0)
            for ingredient in context["ingredients"]
        }

        return {
            "period_start": future_dates[0],
            "period_end": future_dates[-1],
            "days_count": days,
            "ingredients": ingredient_rows,
            "today_needs": today_needs,
            "needs_by_day": needs_by_day,
            "events": [
                {
                    "id": event.id,
                    "name": event.name,
                    "date": event.date,
                    "impact": event.impact,
                    "category": event.category,
                }
                for event in context["events"]
                if event.date <= future_dates[-1]
            ],
        }
