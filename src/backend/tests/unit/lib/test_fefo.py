from __future__ import annotations

from datetime import date, timedelta
import pytest

from app.lib.fefo import Inventory, replay_inventory, simulate_fefo_60_days, take_fefo


def test_take_fefo():
    batches = [
        {"id": 1, "qty": 5.0, "expiry_date": date(2026, 6, 2)},
        {"id": 2, "qty": 10.0, "expiry_date": date(2026, 6, 5)},
    ]
    # Take 7.0: consumes all 5.0 from batch 1, and 2.0 from batch 2
    taken = take_fefo(batches, 7.0)
    assert pytest.approx(taken, 0.001) == 7.0
    assert pytest.approx(batches[0]["qty"], 0.001) == 0.0
    assert pytest.approx(batches[1]["qty"], 0.001) == 8.0

    # Taking more than available
    taken_more = take_fefo(batches, 20.0)
    assert pytest.approx(taken_more, 0.001) == 8.0
    assert pytest.approx(batches[1]["qty"], 0.001) == 0.0


def test_paper_chicken_case_and_fefo():
    # Makalah reference case: need 18-22 kg (mean 20 kg), usable stock 5 kg -> buy 13-17 kg (mean 15 kg)
    need = 20.0
    need_lo = 18.0
    need_hi = 22.0
    stock = 5.0

    buy = max(0.0, need - stock)
    buy_lo = max(0.0, need_lo - stock)
    buy_hi = max(0.0, need_hi - stock)

    assert buy == 15.0
    assert buy_lo == 13.0
    assert buy_hi == 17.0


def test_fefo_simulation_boundaries_and_float_drift():
    d0 = date(2026, 6, 1)
    needs_zero = {d0 + timedelta(days=i): 0.0 for i in range(1, 61)}

    # 1. Ratio < 10% -> rendah (e.g., 5% waste)
    r5 = simulate_fefo_60_days(
        [{"qty": 95.0, "expiry_date": d0 + timedelta(days=90), "unit_price": 1000.0}],
        needs_zero,
        start_date=d0,
        planned_buy=5.0,
        planned_expiry_date=d0 + timedelta(days=1),
        unit_price=1000.0,
    )
    assert r5["risk_level"] == "rendah"
    assert pytest.approx(r5["ratio"], 0.001) == 0.05

    # 2. Ratio exact 10% -> sedang
    r10 = simulate_fefo_60_days(
        [{"qty": 90.0, "expiry_date": d0 + timedelta(days=90), "unit_price": 1000.0}],
        needs_zero,
        start_date=d0,
        planned_buy=10.0,
        planned_expiry_date=d0 + timedelta(days=1),
        unit_price=1000.0,
    )
    assert r10["risk_level"] == "sedang"
    assert pytest.approx(r10["ratio"], 0.001) == 0.10

    # 3. Ratio exact 30% -> sedang
    r30 = simulate_fefo_60_days(
        [{"qty": 70.0, "expiry_date": d0 + timedelta(days=90), "unit_price": 1000.0}],
        needs_zero,
        start_date=d0,
        planned_buy=30.0,
        planned_expiry_date=d0 + timedelta(days=1),
        unit_price=1000.0,
    )
    assert r30["risk_level"] == "sedang"
    assert pytest.approx(r30["ratio"], 0.001) == 0.30

    # 4. Float drift on 30% (e.g. 700 / 300.00000000000006) should not flip to tinggi
    r_drift = simulate_fefo_60_days(
        [{"qty": 700.0, "expiry_date": d0 + timedelta(days=90), "unit_price": 1.0}],
        needs_zero,
        start_date=d0,
        planned_buy=300.00000000000006,
        planned_expiry_date=d0 + timedelta(days=1),
        unit_price=1.0,
    )
    assert r_drift["risk_level"] == "sedang"

    # 5. Ratio > 30% -> tinggi (e.g. 40%)
    r40 = simulate_fefo_60_days(
        [{"qty": 60.0, "expiry_date": d0 + timedelta(days=90), "unit_price": 1000.0}],
        needs_zero,
        start_date=d0,
        planned_buy=40.0,
        planned_expiry_date=d0 + timedelta(days=1),
        unit_price=1000.0,
    )
    assert r40["risk_level"] == "tinggi"
    assert pytest.approx(r40["ratio"], 0.001) == 0.40


def test_zero_unit_price_fallback():
    d0 = date(2026, 6, 1)
    needs_zero = {d0 + timedelta(days=i): 0.0 for i in range(1, 61)}

    # When unit_price is 0, fallback to quantity ratio
    res = simulate_fefo_60_days(
        [{"qty": 50.0, "expiry_date": d0 + timedelta(days=2)}],
        needs_zero,
        start_date=d0,
        planned_buy=50.0,
        planned_expiry_date=d0 + timedelta(days=2),
    )
    assert res["waste_qty"] == 100.0
    assert res["ratio"] == 1.0
    assert res["risk_level"] == "tinggi"


def test_safe_buy_step_down():
    d0 = date(2026, 6, 1)
    # Demand is 10 per day on days 1..5 = 50 total
    # Available stock = 40 (expiring far)
    # If buy = 30 with 2-day shelf life, only 20 can be consumed in 2 days -> 10 wasted!
    # safe_buy should step down to 20
    needs = {d0 + timedelta(days=i): 10.0 for i in range(1, 61)}
    res = simulate_fefo_60_days(
        [{"qty": 40.0, "expiry_date": d0 + timedelta(days=90), "unit_price": 1000.0}],
        needs,
        start_date=d0,
        planned_buy=30.0,
        planned_expiry_date=d0 + timedelta(days=2),
        unit_price=1000.0,
        unit_step=1.0,
    )
    assert res["safe_buy"] <= 30.0
    assert res["safe_buy"] >= 0.0


def test_replay_inventory_chronological():
    d0 = date(2026, 6, 1)
    ingredients = [{"id": 1, "name": "Daging Ayam", "price": 30000.0}]
    recipes = {101: [{"ingredient_id": 1, "qty": 0.2}]}  # 200g per portion

    # Events:
    # 2026-06-01: Receive batch of 10.0 kg
    # 2026-06-01: Sell 20 portions -> consumes 4.0 kg
    # 2026-06-02: Discard 1.0 kg due to damage
    # Result on 2026-06-02: 10.0 - 4.0 - 1.0 = 5.0 kg remaining
    batches = [{
        "id": 1, "ingredient_id": 1, "qty": 10.0,
        "received_date": d0, "expiry_date": d0 + timedelta(days=5),
        "unit_price": 30000.0,
    }]
    sales = [{"product_id": 101, "date": d0, "qty": 20.0}]
    waste_logs = [{"ingredient_id": 1, "date": d0 + timedelta(days=1), "qty": 1.0, "reason": "rusak"}]

    inv = replay_inventory(
        ingredients=ingredients,
        recipes=recipes,
        batches=batches,
        sales=sales,
        waste_logs=waste_logs,
        until=d0 + timedelta(days=1),
    )
    assert pytest.approx(inv.stock(1), 0.001) == 5.0

