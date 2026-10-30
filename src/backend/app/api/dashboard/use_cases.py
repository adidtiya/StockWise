from __future__ import annotations

import math
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dashboard.repository import DashboardRepository
from app.api.exceptions import InsufficientHistoryException
from app.api.recommendation.use_cases import RecommendationUseCase

WIB = ZoneInfo("Asia/Jakarta")


def _month_start(day, offset: int = 0):
    index = day.year * 12 + (day.month - 1) + offset
    return day.replace(year=index // 12, month=index % 12 + 1, day=1)


class DashboardUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = DashboardRepository(db)

    async def execute(self, user) -> dict:
        today = datetime.now(WIB).date()
        user_id = user.id

        products = await self.repo.active_products(user_id)
        ingredients_count = await self.repo.count_ingredients(user_id)
        history_days = await self.repo.history_days(user_id)

        this_month, next_month, prev_month = _month_start(today), _month_start(today, 1), _month_start(today, -1)
        current_cost = await self.repo.waste_cost(user_id, this_month, next_month)
        previous_cost = await self.repo.waste_cost(user_id, prev_month, this_month)
        reduction = round((previous_cost - current_cost) / previous_cost * 100, 1) if previous_cost > 0 else 0.0

        # Risiko & rekomendasi beli memakai hasil UC-06/UC-07; tanpa riwayat cukup -> nol.
        high = medium = items_to_buy = 0
        total_cost = 0.0
        try:
            recs = await RecommendationUseCase(self.db).execute(user)
            for item in recs["items"]:
                level = (item["risk"] or {}).get("level")
                high += level == "tinggi"
                medium += level == "sedang"
                if item["status"] == "beli":
                    items_to_buy += 1
                    total_cost += float(item["buy_cost"])
            total_items = len(recs["items"])
        except InsufficientHistoryException:
            total_items = ingredients_count
        low = max(0, total_items - high - medium)

        stock = await self.repo.usable_stock(user_id, today)
        recipes = await self.repo.recipes_for([p.id for p in products])
        portions = []
        for product in products:
            rows = recipes.get(product.id, [])
            if rows:
                remaining = min(
                    math.floor(stock.get(r.ingredient_id, 0.0) / float(r.qty) + 1e-9)
                    for r in rows if float(r.qty) > 0
                ) if any(float(r.qty) > 0 for r in rows) else 0
            else:
                remaining = 0
            portions.append({"product_id": product.id, "product_name": product.name,
                             "remaining_portions": max(0, remaining)})

        return {
            "date": today,
            "counts": {"products": len(products), "ingredients": ingredients_count, "history_days": history_days},
            "waste": {"current_month_cost": round(current_cost), "previous_month_cost": round(previous_cost),
                      "reduction_percentage": reduction},
            "risk": {"high": high, "medium": medium, "low": low},
            "buy": {"items_to_buy": items_to_buy, "estimated_total_cost": round(total_cost)},
            "portions": portions,
        }

