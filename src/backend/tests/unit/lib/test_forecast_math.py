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
    assert needs[1]["low"] <= needs[1]["total"] <= needs[1]["high"]


@pytest.fixture
def synthetic_sales_60_days() -> tuple[list[date], list[float]]:
    """Fixture providing 60 days of synthetic sales data with weekly pattern and trend."""
    start = date(2026, 3, 1)
    dates = [start + timedelta(days=i) for i in range(60)]
    # Realistic day-of-week demand pattern:
    # Mon-Thu base ~ 15-20, Fri ~ 28, Sat-Sun ~ 35-40
    dow_multipliers = [1.0, 0.9, 1.1, 1.05, 1.5, 2.0, 1.8]
    sales = []
    for i, d in enumerate(dates):
        base = 20.0 + (i / 60.0) * 5.0  # slight upward trend
        qty = base * dow_multipliers[d.weekday()]
        sales.append(round(qty, 1))
    return dates, sales


def test_synthetic_sales_60_days_forecast_math(synthetic_sales_60_days):
    dates, sales = synthetic_sales_60_days
    assert len(dates) == 60
    assert len(sales) == 60

    # 1. Level smoothing test
    level = exponential_smoothing(sales, alpha=0.2)
    assert level > 0.0

    # 2. Day-of-week factors test
    factors = dow_factors(sales, dates)
    assert len(factors) == 7
    # Weekend (Fri=4, Sat=5, Sun=6) should have factor > 1.0 due to pattern
    assert factors[5] > 1.0  # Saturday
    assert factors[6] > 1.0  # Sunday
    assert factors[1] < 1.0  # Tuesday

    # 3. Event factors test
    event_date = dates[45]
    events = {event_date: [{"name": "Libur Nasional", "impact": 1.4}]}
    factors_with_event = dow_factors(sales, dates, event_dates=[event_date])
    assert len(factors_with_event) == 7

    # 4. Forecast range validation (need_lo <= need <= need_hi)
    future_dates = [dates[-1] + timedelta(days=i) for i in range(1, 8)]
    res = forecast_series(sales, dates, future_dates, events=events)
    assert res["low"] <= res["total"] <= res["high"]
    assert len(res["predictions"]) == 7
    for p in res["predictions"]:
        assert p >= 0.0


def test_edge_case_all_zero_sales():
    """Kasus batas: seluruh penjualan bernilai nol."""
    start = date(2026, 3, 1)
    dates = [start + timedelta(days=i) for i in range(60)]
    zeros = [0.0] * 60

    # Level smoothing on zero values returns 0.0
    level = exponential_smoothing(zeros, 0.2)
    assert level == 0.0

    # Day-of-week factors default to 1.0 when average is 0
    factors = dow_factors(zeros, dates)
    assert factors == [1.0] * 7

    # WAPE on zero actuals returns None without division by zero
    assert wape(zeros, [1.0] * 60) is None

    # Forecast series on all zeros
    future_dates = [start + timedelta(days=60 + i) for i in range(7)]
    res = forecast_series(zeros, dates, future_dates)
    assert res["level"] == 0.0
    assert res["total"] == 0.0
    assert res["low"] == 0.0
    assert res["high"] == 0.0
    assert res["low"] <= res["total"] <= res["high"]
    for p in res["predictions"]:
        assert p == 0.0


def test_edge_case_zero_demand_and_ingredient_needs():
    """Kasus batas: kebutuhan 0 pada agregasi kebutuhan bahan."""
    # Product with 0 demand
    p_zero = {"total": 0.0, "half": 0.0, "low": 0.0, "high": 0.0}
    recipes = {1: [{"ingredient_id": 10, "qty": 0.5}]}

    needs = ingredient_needs({1: p_zero}, recipes)
    assert 10 in needs
    assert needs[10]["total"] == 0.0
    assert needs[10]["low"] == 0.0
    assert needs[10]["high"] == 0.0
    assert needs[10]["low"] <= needs[10]["total"] <= needs[10]["high"]

    # Empty product forecasts or empty recipes
    assert ingredient_needs({}, recipes) == {}
    assert ingredient_needs({1: p_zero}, {}) == {}


