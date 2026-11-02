"""Pure forecasting helpers used by the forecast and evaluation domains."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from math import sqrt
from typing import Any, Iterable, Mapping, Sequence

ALPHAS = (0.05, 0.1, 0.2, 0.3, 0.5)
DEFAULT_ALPHA = 0.2
HISTORY_DAYS = 120
DOW_WINDOW = 56
EVAL_DAYS = 28


def _as_date(value: date | str) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def wape(actual: Sequence[float], predicted: Sequence[float]) -> float | None:
    """Compute Weighted Absolute Percentage Error: sum(|y - y_hat|) / sum(y)."""
    if len(actual) != len(predicted):
        raise ValueError("actual dan predicted harus memiliki panjang yang sama")
    denominator = sum(max(0.0, float(value)) for value in actual)
    if denominator <= 0:
        return None
    return sum(abs(float(y) - float(p)) for y, p in zip(actual, predicted)) / denominator


def exponential_smoothing(values: Sequence[float], alpha: float = DEFAULT_ALPHA) -> float:
    """Return the final smoothed level, seeding it with the first observation."""
    if not 0 < alpha <= 1:
        raise ValueError("alpha harus berada pada rentang (0, 1]")
    if not values:
        return 0.0
    level = max(0.0, float(values[0]))
    for value in values[1:]:
        level = alpha * max(0.0, float(value)) + (1.0 - alpha) * level
    return level


def dow_factors(
    values: Sequence[float],
    dates: Sequence[date | str],
    event_dates: Iterable[date | str] = (),
) -> list[float]:
    """Compute day-of-week multipliers with empirical Bayes shrinkage to 1.0.

    Excludes days with special events and uses up to the last 56 days (8 weeks).
    """
    sums, counts = [0.0] * 7, [0] * 7
    events = {_as_date(d) for d in event_dates}
    indexes = range(max(0, len(values) - DOW_WINDOW), len(values))
    total, count = 0.0, 0
    for i in indexes:
        day = _as_date(dates[i])
        if day in events:
            continue
        weekday = day.weekday()
        value = max(0.0, float(values[i]))
        sums[weekday] += value
        counts[weekday] += 1
        total += value
        count += 1
    average = total / count if count else 0.0
    result = []
    for weekday in range(7):
        if average <= 0 or counts[weekday] == 0:
            result.append(1.0)
        else:
            raw = sums[weekday] / counts[weekday] / average
            result.append(min(3.0, max(0.2, 1.0 + (raw - 1.0) * (counts[weekday] / (counts[weekday] + 2.0)))))
    return result


def learn_event_factors(
    observations: Iterable[Mapping[str, Any]],
) -> dict[str, float]:
    """Learn event multipliers from {name, actual, expected, impact} observations using credibility weighting."""
    grouped: dict[str, dict[str, float]] = defaultdict(lambda: {"actual": 0.0, "expected": 0.0, "n": 0.0, "impact": 1.0})
    for row in observations:
        item = grouped[str(row["name"])]
        item["actual"] += max(0.0, float(row.get("actual", 0)))
        item["expected"] += max(0.0, float(row.get("expected", 0)))
        item["n"] += 1
        item["impact"] = float(row.get("impact", item["impact"]))
    factors = {}
    for name, stats in grouped.items():
        if stats["expected"] <= 0:
            factors[name] = stats["impact"]
            continue
        learned = min(3.0, max(0.3, stats["actual"] / stats["expected"]))
        weight = stats["n"] / (stats["n"] + 1.0)
        factors[name] = learned * weight + stats["impact"] * (1.0 - weight)
    return factors


def one_step_predictions(
    values: Sequence[float],
    alpha: float = DEFAULT_ALPHA,
    dates: Sequence[date | str] | None = None,
    events: Mapping[date | str, Sequence[Mapping[str, Any]]] | None = None,
) -> list[float | None]:
    """Return leakage-free one-step-ahead predictions for the series.

    When dates and events are provided, applies deseasonalization by DOW factors,
    warmup mean on the first 7 points, and dynamic event multipliers.
    """
    if not 0 < alpha <= 1:
        raise ValueError("alpha harus berada pada rentang (0, 1]")
    if not values:
        return []

    n = len(values)
    if dates is None:
        dates_list = [date(2000, 1, 1) + timedelta(days=i) for i in range(n)]
    else:
        dates_list = [_as_date(d) for d in dates]

    event_map: dict[date, list[Mapping[str, Any]]] = defaultdict(list)
    for raw_date, rows in (events or {}).items():
        event_map[_as_date(raw_date)].extend(rows)

    factors = dow_factors(values, dates_list, event_map.keys())
    event_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"actual": 0.0, "expected": 0.0, "n": 0.0})

    level: float | None = None
    warm: list[float] = []
    predictions: list[float | None] = [None] * n

    for i in range(n):
        day = dates_list[i]
        w = day.weekday()
        evs = event_map.get(day, [])

        fac = 1.0
        for e in evs:
            s = event_stats.get(str(e.get("name", "")))
            impact = float(e.get("impact", 1.0))
            if not s or s["expected"] <= 0:
                fac *= impact
            else:
                learned = min(3.0, max(0.3, s["actual"] / s["expected"]))
                weight = s["n"] / (s["n"] + 1.0)
                fac *= learned * weight + impact * (1.0 - weight)

        y = max(0.0, float(values[i]))
        if level is not None:
            base = level * factors[w]
            predictions[i] = max(0.0, base * fac)

        # Update level only on non-event days
        if not evs:
            ds = y / factors[w] if factors[w] > 0 else y
            if level is None:
                warm.append(ds)
                if len(warm) >= 7:
                    level = sum(warm) / len(warm)
            else:
                level = alpha * ds + (1.0 - alpha) * level
        else:
            if level is not None:
                expected = level * factors[w]
                if expected > 0:
                    for e in evs:
                        st = event_stats[str(e.get("name", ""))]
                        st["actual"] += y
                        st["expected"] += expected
                        st["n"] += 1.0

    return predictions


def select_alpha(
    values: Sequence[float],
    alphas: Iterable[float] = ALPHAS,
    dates: Sequence[date | str] | None = None,
    events: Mapping[date | str, Sequence[Mapping[str, Any]]] | None = None,
) -> tuple[float, float | None]:
    """Choose alpha using leakage-free one-step-ahead WAPE on the final 28 points."""
    best_alpha, best_score = DEFAULT_ALPHA, None
    eval_start = max(1, len(values) - EVAL_DAYS)

    for alpha in alphas:
        preds = one_step_predictions(values, alpha, dates=dates, events=events)
        paired = [(float(values[i]), preds[i]) for i in range(eval_start, len(values)) if preds[i] is not None]
        if not paired:
            continue
        act = [p[0] for p in paired]
        pred = [p[1] for p in paired]
        score = wape(act, pred)
        if score is not None and (best_score is None or score < best_score):
            best_alpha, best_score = alpha, score

    return best_alpha, best_score


def forecast_series(
    values: Sequence[float],
    dates: Sequence[date | str],
    future_dates: Sequence[date | str],
    *,
    alpha: float | None = None,
    events: Mapping[date | str, Sequence[Mapping[str, Any]]] | None = None,
) -> dict[str, Any]:
    """Forecast a daily product series using smoothed level, weekday and event factors."""
    if len(values) != len(dates):
        raise ValueError("values dan dates harus memiliki panjang yang sama")

    chosen_alpha = alpha if alpha is not None else select_alpha(values, dates=dates, events=events)[0]
    dates_list = [_as_date(d) for d in dates]
    event_map: dict[date, list[Mapping[str, Any]]] = defaultdict(list)
    for raw_date, rows in (events or {}).items():
        event_map[_as_date(raw_date)].extend(rows)

    factors = dow_factors(values, dates_list, event_map.keys())

    # Forward pass to fit level and learn event stats
    preds = one_step_predictions(values, chosen_alpha, dates=dates_list, events=event_map)

    # Calculate final level and event multipliers
    level: float | None = None
    warm: list[float] = []
    event_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"actual": 0.0, "expected": 0.0, "n": 0.0})

    for i, (day, val) in enumerate(zip(dates_list, values)):
        w = day.weekday()
        evs = event_map.get(day, [])
        y = max(0.0, float(val))
        if not evs:
            ds = y / factors[w] if factors[w] > 0 else y
            if level is None:
                warm.append(ds)
                if len(warm) >= 7:
                    level = sum(warm) / len(warm)
            else:
                level = chosen_alpha * ds + (1.0 - chosen_alpha) * level
        else:
            if level is not None:
                expected = level * factors[w]
                if expected > 0:
                    for e in evs:
                        st = event_stats[str(e.get("name", ""))]
                        st["actual"] += y
                        st["expected"] += expected
                        st["n"] += 1.0

    if level is None:
        level = sum(warm) / len(warm) if warm else (max(0.0, float(values[-1])) if values else 0.0)

    event_factors = {}
    for name, st in event_stats.items():
        if st["expected"] > 0:
            learned = min(3.0, max(0.3, st["actual"] / st["expected"]))
            weight = st["n"] / (st["n"] + 1.0)
            event_factors[name] = learned * weight + 1.0 * (1.0 - weight)

    # Future predictions
    predictions = []
    for raw in future_dates:
        day = _as_date(raw)
        amount = level * factors[day.weekday()]
        for event in event_map.get(day, []):
            name = str(event.get("name", ""))
            impact = float(event.get("impact", 1.0))
            if name in event_factors:
                amount *= event_factors[name]
            else:
                amount *= impact
        predictions.append(max(0.0, amount))

    # Calculate residual error (sigma) from last 28 days of one-step predictions
    residuals = []
    eval_start = max(0, len(values) - EVAL_DAYS)
    for i in range(eval_start, len(values)):
        if preds[i] is None:
            continue
        pred_val = float(preds[i])
        actual_val = max(0.0, float(values[i]))
        residuals.append((actual_val - pred_val) / max(pred_val, 1.0))

    sigma = min(0.6, max(0.08, sqrt(sum(r * r for r in residuals) / len(residuals)))) if residuals else 0.3
    total = sum(predictions)
    half = total * sigma / sqrt(max(1, len(predictions)))

    return {
        "alpha": chosen_alpha,
        "level": level,
        "dow_factors": factors,
        "event_factors": event_factors,
        "predictions": predictions,
        "total": total,
        "low": max(0.0, total - half),
        "high": total + half,
        "half": half,
        "sigma": sigma,
    }


def ingredient_needs(
    product_forecasts: Mapping[int, Mapping[str, Any]],
    recipes: Mapping[int, Sequence[Mapping[str, Any]]],
) -> dict[int, dict[str, float]]:
    """Convert product forecast totals and ranges into ingredient quantities.

    Aggregates variance across recipes: variance = sum((half * qty)^2), sd = sqrt(variance).
    """
    accumulators: dict[int, dict[str, float]] = defaultdict(lambda: {"need": 0.0, "var": 0.0})
    for product_id, forecast in product_forecasts.items():
        total = float(forecast.get("total", 0.0))
        half = float(forecast.get("half", (float(forecast.get("high", total)) - float(forecast.get("low", total))) / 2.0))
        for recipe in recipes.get(product_id, ()):
            ingredient_id = int(recipe["ingredient_id"])
            qty = float(recipe["qty"])
            accumulators[ingredient_id]["need"] += total * qty
            accumulators[ingredient_id]["var"] += (half * qty) ** 2

    result: dict[int, dict[str, float]] = {}
    for ingredient_id, acc in accumulators.items():
        need = acc["need"]
        sd = sqrt(acc["var"])
        result[ingredient_id] = {
            "total": need,
            "low": max(0.0, need - sd),
            "high": need + sd,
            "half": sd,
        }
    return result
