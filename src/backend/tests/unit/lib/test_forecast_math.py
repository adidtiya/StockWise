from __future__ import annotations

from datetime import date, timedelta
import pytest

from app.lib.forecast_math import (
    ALPHAS,
    DEFAULT_ALPHA,
    DOW_WINDOW,
    EVAL_DAYS,
    dow_factors,
    exponential_smoothing,
    forecast_series,
    ingredient_needs,
    learn_event_factors,
    one_step_predictions,
    select_alpha,
    wape,
)


def test_alphas_constant():
    assert ALPHAS == (0.05, 0.1, 0.2, 0.3, 0.5)
    assert DEFAULT_ALPHA == 0.2
    assert DOW_WINDOW == 56
    assert EVAL_DAYS == 28


def test_wape_calculation_and_zero_division():
    # Normal case
    actual = [10.0, 20.0, 30.0]
    predicted = [12.0, 18.0, 33.0]
    # sum(|y - p|) = 2 + 2 + 3 = 7; sum(y) = 60; 7 / 60 = 0.11666...
    assert pytest.approx(wape(actual, predicted), 0.0001) == 7.0 / 60.0

    # Zero actuals: sum(actual) == 0 should return None, avoiding ZeroDivisionError
    assert wape([0.0, 0.0, 0.0], [5.0, 2.0, 1.0]) is None
    assert wape([], []) is None


def test_exponential_smoothing():
    values = [10.0, 20.0, 30.0]
    # Seeding with first observation:
    # l0 = 10
    # l1 = 0.2 * 20 + 0.8 * 10 = 4 + 8 = 12
    # l2 = 0.2 * 30 + 0.8 * 12 = 6 + 9.6 = 15.6
    res = exponential_smoothing(values, 0.2)
    assert pytest.approx(res, 0.001) == 15.6

    assert exponential_smoothing([]) == 0.0
    with pytest.raises(ValueError):
        exponential_smoothing(values, 0.0)
    with pytest.raises(ValueError):
        exponential_smoothing(values, 1.5)


def test_dow_factors_shrinkage_and_event_exclusion():
    start = date(2026, 4, 1)
    dates = [start + timedelta(days=i) for i in range(56)]
    # All days equal demand 10.0
    values = [10.0] * 56
    # Factor on uniform demand should be 1.0
    factors = dow_factors(values, dates)
    assert len(factors) == 7
    for f in factors:
        assert pytest.approx(f, 0.01) == 1.0

    # Event day excluded
    event_date = dates[10]
    values_with_spike = list(values)
    values_with_spike[10] = 500.0  # Spike on event day
    factors_excluded = dow_factors(values_with_spike, dates, event_dates=[event_date])
    for f in factors_excluded:
        assert pytest.approx(f, 0.01) == 1.0


def test_learn_event_factors_credibility():
    # w = n / (n + 1)
    # n = 1: w = 1/2 = 0.5. learned = actual / expected = 200 / 100 = 2.0.
    # factor = 2.0 * 0.5 + 1.2 * 0.5 = 1.6
    obs = [{"name": "Promo", "actual": 200.0, "expected": 100.0, "impact": 1.2}]
    factors = learn_event_factors(obs)
    assert pytest.approx(factors["Promo"], 0.001) == 1.6


def test_one_step_predictions_and_select_alpha():
    start = date(2026, 4, 1)
    dates = [start + timedelta(days=i) for i in range(60)]
    series = [float(20 + (i % 7) * 3) for i in range(60)]

    preds = one_step_predictions(series, 0.1, dates=dates)
    assert len(preds) == 60
    # First points before warmup mean has None or initial values
    assert preds[0] is None

    best_alpha, score = select_alpha(series, dates=dates)
    assert best_alpha in ALPHAS
    assert score is not None
    assert score >= 0.0


def test_forecast_series_and_variance_aggregation():
    start = date(2026, 4, 1)
    dates = [start + timedelta(days=i) for i in range(60)]
    series = [float(20 + (i % 7) * 3 + (i % 5)) for i in range(60)]
    future_dates = [date(2026, 5, 31), date(2026, 6, 1), date(2026, 6, 2)]

    res = forecast_series(series, dates, future_dates, alpha=0.1)
    assert res["alpha"] == 0.1
    assert len(res["predictions"]) == 3
    assert res["total"] > 0
    assert res["low"] <= res["total"] <= res["high"]

    # Test ingredient needs variance aggregation:
    # 2 products, both using ingredient 1
    # Recipe: product 1 needs 2.0 of ing 1, product 2 needs 1.0 of ing 1
    p1 = {"total": 10.0, "half": 2.0}
    p2 = {"total": 5.0, "half": 1.0}
    # Expected need = 10 * 2 + 5 * 1 = 25
    # Variance = (2 * 2)^2 + (1 * 1)^2 = 16 + 1 = 17
    # sd = sqrt(17) ~ 4.1231
    recipes = {
        1: [{"ingredient_id": 1, "qty": 2.0}],
        2: [{"ingredient_id": 1, "qty": 1.0}],
    }
    needs = ingredient_needs({1: p1, 2: p2}, recipes)
    assert 1 in needs
    assert pytest.approx(needs[1]["total"], 0.001) == 25.0
    import math
    assert pytest.approx(needs[1]["low"], 0.001) == max(0.0, 25.0 - math.sqrt(17))
    assert pytest.approx(needs[1]["high"], 0.001) == 25.0 + math.sqrt(17)

