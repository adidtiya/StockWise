from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.evaluation.repository import EvaluationRepository
from app.lib.forecast_math import ALPHAS, DEFAULT_ALPHA, one_step_predictions, wape

WIB = ZoneInfo("Asia/Jakarta")
EVALUATION_DAYS = 28
HISTORY_DAYS = 120


class EvaluationUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = EvaluationRepository(db)

    async def _prepare(self, user_id: int) -> tuple[dict, list[date], dict[int, list[float]], dict[date, list[dict]]]:
        today = datetime.now(WIB).date()
        start = today - timedelta(days=HISTORY_DAYS)
        context = await self.repo.sales_history(user_id, start, today)
        dates = [start + timedelta(days=i) for i in range((today - start).days)]
        by_product = {product.id: [0.0] * len(dates) for product in context["products"]}
        indexes = {day: i for i, day in enumerate(dates)}
        for row in context["sales"]:
            if row.date in indexes and row.product_id in by_product:
                by_product[row.product_id][indexes[row.date]] = float(row.qty)

        events_by_date: dict[date, list[dict]] = defaultdict(list)
        for ev in context.get("events", []):
            events_by_date[ev.date].append({"name": ev.name, "impact": float(ev.impact)})

        return context, dates, by_product, events_by_date

    async def evaluate(self, user_id: int) -> dict:
        context, dates, series, events_by_date = await self._prepare(user_id)
        state = context["state"]
        alpha = float(state.alpha) if state is not None else DEFAULT_ALPHA

        actual_all, predicted_all, product_rows = [], [], []
        actual_prev_all, predicted_prev_all = [], []

        evaluation_start = max(1, len(dates) - EVALUATION_DAYS)
        prev_start = max(1, len(dates) - EVALUATION_DAYS * 2)

        for product in context["products"]:
            product_values = series[product.id]
            predictions = one_step_predictions(product_values, alpha, dates=dates, events=events_by_date)

            actual = product_values[evaluation_start:]
            pred_slice = predictions[evaluation_start:]
            paired = [(y, p) for y, p in zip(actual, pred_slice) if p is not None]

            product_actual = [pair[0] for pair in paired]
            product_predicted = [pair[1] for pair in paired]
            score = wape(product_actual, product_predicted)

            actual_all.extend(product_actual)
            predicted_all.extend(product_predicted)

            # Prior window (T-56 .. T-28) for accuracy_prev
            if len(dates) >= EVALUATION_DAYS * 2:
                prev_actual = product_values[prev_start:evaluation_start]
                prev_pred_slice = predictions[prev_start:evaluation_start]
                prev_paired = [(y, p) for y, p in zip(prev_actual, prev_pred_slice) if p is not None]
                actual_prev_all.extend([p[0] for p in prev_paired])
                predicted_prev_all.extend([p[1] for p in prev_paired])

            bias = None
            if paired:
                delta = sum(p - y for y, p in paired)
                bias = "over" if delta > 0 else ("under" if delta < 0 else "balanced")

            product_rows.append({
                "product_id": product.id,
                "product_name": product.name,
                "accuracy": round(max(0.0, 1.0 - score) * 100, 1) if score is not None else None,
                "bias": bias,
            })

        overall = wape(actual_all, predicted_all)
        accuracy = round(max(0.0, 1.0 - overall) * 100, 1) if overall is not None else None

        prev_overall = wape(actual_prev_all, predicted_prev_all) if actual_prev_all else None
        accuracy_prev = round(max(0.0, 1.0 - prev_overall) * 100, 1) if prev_overall is not None else None

        samples = sum(len(values) for values in series.values())
        return {
            "accuracy": accuracy,
            "accuracy_prev": accuracy_prev,
            "model": {
                "alpha": alpha,
                "wape": overall,
                "samples": samples,
                "history_days": len({row.date for row in context["sales"]}),
                "trained_at": state.trained_at if state is not None else None,
            },
            "products": product_rows,
        }

    async def train(self, user_id: int) -> dict:
        context, dates, series, events_by_date = await self._prepare(user_id)
        product_scores = []
        evaluation_start = max(1, len(dates) - EVALUATION_DAYS)

        for alpha in ALPHAS:
            actual_all, predictions_all = [], []
            for values in series.values():
                predictions = one_step_predictions(values, alpha, dates=dates, events=events_by_date)
                for index in range(evaluation_start, len(values)):
                    pred = predictions[index]
                    if pred is not None:
                        actual_all.append(values[index])
                        predictions_all.append(pred)
            product_scores.append((alpha, wape(actual_all, predictions_all)))

        valid = [(alpha, score) for alpha, score in product_scores if score is not None]
        if valid:
            alpha, score = min(valid, key=lambda item: item[1])
        else:
            alpha, score = DEFAULT_ALPHA, None

        samples = sum(len(values) for values in series.values())
        state = await self.repo.save_model_state(user_id, alpha, score, samples)
        return {
            "trained": True,
            "optimal_alpha": float(state.alpha),
            "wape": score,
            "samples": samples,
        }
