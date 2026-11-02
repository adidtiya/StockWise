from __future__ import annotations

import math
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.forecast.use_cases import ForecastUseCase
from app.api.recommendation.repository import RecommendationRepository
from app.lib.fefo import replay_inventory, simulate_fefo_60_days, take_fefo

WIB = ZoneInfo("Asia/Jakarta")
FRACTIONAL_UNITS = {"kg", "liter", "l"}


def _step(unit: str) -> float:
    return 0.5 if unit.lower() in FRACTIONAL_UNITS else 1.0


def _ceil_to(value: float, step: float) -> float:
    return math.ceil(value / step - 1e-9) * step


def _short_date(day) -> str:
    return day.strftime("%a, %d %b")


class RecommendationUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = RecommendationRepository(db)

    async def execute(self, user, *, status: str | None = None) -> dict:
        today = datetime.now(WIB).date()
        start = today + timedelta(days=1)

        # 1. Replay historical inventory up to today (TRD 7.2.1)
        context = await self.repo.load_inventory_context(user.id, today)
        inv = replay_inventory(
            ingredients=[{"id": i.id, "name": i.name, "price": float(i.price)} for i in context["ingredients"]],
            recipes=context["recipes"],
            batches=[{
                "id": b.id,
                "ingredient_id": b.ingredient_id,
                "qty": float(b.qty),
                "received_date": b.received_date,
                "expiry_date": b.expiry_date,
                "unit_price": float(b.unit_price if b.unit_price is not None else 0.0),
            } for b in context["batches"]],
            sales=[{"product_id": s.product_id, "date": s.date, "qty": float(s.qty)} for s in context["sales"]],
            waste_logs=[{
                "ingredient_id": w.ingredient_id,
                "date": w.date,
                "qty": float(w.qty),
                "reason": w.reason,
            } for w in context["waste_logs"]],
            until=today,
        )

        # 2. 60-day forecast projection starting from T+1
        forecast = await ForecastUseCase(self.db).execute(user, days=60, internal=True)
        daily_by_ingredient: dict[int, dict] = {
            row["id"]: {entry["date"]: entry for entry in row["daily_needs"]}
            for row in forecast["ingredients"]
        }

        # 3. Projected remaining consumption for today (T)
        predicted_remaining_today = dict(forecast.get("today_needs", {}))
        for product_id, sold_qty in context["today_sold"].items():
            for recipe in context["recipes"].get(product_id, []):
                ing_id = int(recipe["ingredient_id"])
                consumed = float(sold_qty) * float(recipe["qty"])
                predicted_remaining_today[ing_id] = max(
                    0.0,
                    predicted_remaining_today.get(ing_id, 0.0) - consumed,
                )

        future_dates = [start + timedelta(days=i) for i in range(60)]
        items = []

        for ingredient in context["ingredients"]:
            # Copy active batches as of today
            raw_batches = [dict(b) for b in inv.batches_of(ingredient.id)]
            stock_now = sum(float(b["qty"]) for b in raw_batches if b["expiry_date"] >= today)

            # Consume remaining consumption of today using FEFO from current stock
            today_need = predicted_remaining_today.get(ingredient.id, 0.0)
            take_fefo(raw_batches, today_need)

            # Batches usable at start of tomorrow (T+1)
            start_batches = [
                b for b in raw_batches
                if b["expiry_date"] >= start and float(b["qty"]) > 1e-6
            ]
            stock_start = sum(float(b["qty"]) for b in start_batches)

            # Adaptive purchase horizon (PRD UC-05): segar = 1 day, durable = 7 or 30 days
            horizon = 1 if ingredient.category == "segar" else (30 if ingredient.shelf_life_days >= 90 else 7)
            daily = daily_by_ingredient.get(ingredient.id, {})
            period_dates = [start + timedelta(days=i) for i in range(horizon)]

            need = sum(float(daily.get(d, {}).get("need", 0.0)) for d in period_dates)
            need_lo = sum(float(daily.get(d, {}).get("need_lo", 0.0)) for d in period_dates)
            need_hi = sum(float(daily.get(d, {}).get("need_hi", 0.0)) for d in period_dates)

            step = _step(ingredient.unit)
            buy = _ceil_to(max(0.0, need - stock_start), step)
            buy_lo = _ceil_to(max(0.0, need_lo - stock_start), step)
            buy_hi = _ceil_to(max(0.0, need_hi - stock_start), step)

            # Forward 60-day FEFO simulation
            usage = {d: float(daily.get(d, {}).get("need", 0.0)) for d in future_dates}
            planned_expiry = today + timedelta(days=max(int(ingredient.shelf_life_days), 2) - 1)

            sim = simulate_fefo_60_days(
                start_batches,
                usage,
                start_date=today,
                planned_buy=buy,
                planned_expiry_date=planned_expiry,
                unit_price=float(ingredient.price),
                unit_step=step,
                days=60,
            )

            first_date = min((w["date"] for w in sim["waste"]), default=None)
            message = None
            if sim["risk_level"]:
                suggestions = []
                if sim["base_waste_qty"] > 0:
                    suggestions.append(f"Stok saat ini berisiko terbuang. Dahulukan pemakaian {ingredient.name}.")
                if sim["safe_buy"] < buy:
                    suggestions.append(f"Kurangi pembelian menjadi {sim['safe_buy']:g} {ingredient.unit} agar tidak menambah bahan terbuang.")
                message = " ".join(suggestions) or f"Periksa umur simpan {ingredient.name} sebelum membeli."

            risk = None if not sim["risk_level"] else {
                "level": sim["risk_level"],
                "waste_qty": round(sim["waste_qty"], 2),
                "waste_value": round(sim["waste_value"]),
                "ratio": round(sim["ratio"], 3),
                "first_date": first_date,
                "safe_buy": sim["safe_buy"],
                "message": message,
            }

            item = {
                "id": ingredient.id,
                "name": ingredient.name,
                "category": ingredient.category,
                "unit": ingredient.unit,
                "horizon": horizon,
                "period_label": f"Besok, {_short_date(start)}" if horizon == 1 else f"{horizon} hari ({_short_date(start)} – {_short_date(period_dates[-1])})",
                "stock_now": round(stock_now, 2),
                "stock_start": round(stock_start, 2),
                "need": round(need, 2),
                "need_lo": round(need_lo, 2),
                "need_hi": round(need_hi, 2),
                "buy": buy,
                "buy_lo": buy_lo,
                "buy_hi": buy_hi,
                "buy_cost": round(buy * float(ingredient.price)),
                "status": "beli" if buy > 0 else "cukup",
                "risk": risk,
            }

            if status is None or status == "all" or item["status"] == status:
                items.append(item)

        return {"date": today, "period_start": start, "items": items}
