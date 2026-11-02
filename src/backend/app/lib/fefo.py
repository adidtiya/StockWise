"""Pure FEFO inventory simulation, chronological replay, and waste risk calculations."""

from __future__ import annotations

import math
from collections import defaultdict
from copy import deepcopy
from datetime import date, timedelta
from typing import Any, Mapping, Sequence

EPSILON = 1e-6
PROJECTION_DAYS = 60


def _as_date(value: date | str) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def take_fefo(batches: list[dict[str, Any]], qty: float) -> float:
    """Consume up to qty from batches sorted by earliest expiry date."""
    need = qty
    for b in batches:
        if need <= EPSILON:
            break
        t = min(float(b.get("qty", 0.0)), need)
        b["qty"] = float(b.get("qty", 0.0)) - t
        need -= t
    return qty - need


class Inventory:
    """In-memory inventory state tracking batches per ingredient."""

    def __init__(self, ingredients: Sequence[Mapping[str, Any]]) -> None:
        self.items: dict[int, dict[str, Any]] = {
            int(i["id"]): {"ing": dict(i), "batches": []} for i in ingredients
        }
        self.waste: list[dict[str, Any]] = []
        self.shortages: list[dict[str, Any]] = []

    def add_batch(self, b: Mapping[str, Any]) -> None:
        ing_id = int(b["ingredient_id"])
        it = self.items.get(ing_id)
        if not it:
            return
        it["batches"].append({
            "id": b.get("id"),
            "qty": max(0.0, float(b["qty"])),
            "received_date": _as_date(b["received_date"]),
            "expiry_date": _as_date(b["expiry_date"]),
            "unit_price": float(b.get("unit_price") or it["ing"].get("price", 0.0) or 0.0),
        })
        it["batches"].sort(key=lambda x: (x["expiry_date"], int(x.get("id") or 0)))

    def take(self, ingredient_id: int, qty: float) -> list[dict[str, float]]:
        it = self.items.get(ingredient_id)
        taken: list[dict[str, float]] = []
        if not it:
            return taken
        need = qty
        for b in it["batches"]:
            if need <= EPSILON:
                break
            b_qty = float(b["qty"])
            if b_qty <= EPSILON:
                continue
            t = min(b_qty, need)
            b["qty"] = b_qty - t
            need -= t
            taken.append({"qty": t, "unit_price": b["unit_price"]})
        it["batches"] = [b for b in it["batches"] if float(b["qty"]) > EPSILON]
        return taken

    def consume(self, ingredient_id: int, qty: float, event_date: date) -> None:
        taken = self.take(ingredient_id, qty)
        got = sum(t["qty"] for t in taken)
        if got < qty - EPSILON:
            self.shortages.append({"ingredient_id": ingredient_id, "date": event_date, "qty": qty - got})

    def discard(self, ingredient_id: int, qty: float, event_date: date, reason: str = "manual") -> None:
        for t in self.take(ingredient_id, qty):
            self.waste.append({
                "ingredient_id": ingredient_id,
                "date": event_date,
                "qty": t["qty"],
                "value": t["qty"] * t["unit_price"],
                "reason": reason,
            })

    def expire(self, on_date: date) -> None:
        """Move batches with expiry_date < on_date to waste at the start of on_date."""
        for ing_id, it in self.items.items():
            keep = []
            for b in it["batches"]:
                if b["expiry_date"] < on_date:
                    if float(b["qty"]) > EPSILON:
                        self.waste.append({
                            "ingredient_id": ing_id,
                            "date": b["expiry_date"],
                            "qty": b["qty"],
                            "value": b["qty"] * b["unit_price"],
                            "reason": "kedaluwarsa",
                            "auto": True,
                        })
                else:
                    keep.append(b)
            it["batches"] = keep

    def batches_of(self, ingredient_id: int) -> list[dict[str, Any]]:
        it = self.items.get(ingredient_id)
        return it["batches"] if it else []

    def stock(self, ingredient_id: int, on_date: date | None = None) -> float:
        batches = self.batches_of(ingredient_id)
        if on_date is not None:
            batches = [b for b in batches if b["expiry_date"] >= on_date]
        return sum(float(b["qty"]) for b in batches)


def replay_inventory(
    ingredients: Sequence[Mapping[str, Any]],
    recipes: Mapping[int, Sequence[Mapping[str, Any]]],
    batches: Sequence[Mapping[str, Any]],
    sales: Sequence[Mapping[str, Any]],
    waste_logs: Sequence[Mapping[str, Any]] = (),
    until: date | str | None = None,
) -> Inventory:
    """Replay chronological inventory events: receive -> consume (BOM) -> discard -> expire.

    Implements TRD 7.2.1.
    """
    inv = Inventory(ingredients)
    end_date = _as_date(until) if until is not None else date.today()

    batches_by_date: dict[date, list[Mapping[str, Any]]] = defaultdict(list)
    for b in batches:
        rec_d = _as_date(b["received_date"])
        if rec_d <= end_date:
            batches_by_date[rec_d].append(b)

    sales_by_date: dict[date, list[Mapping[str, Any]]] = defaultdict(list)
    for s in sales:
        s_date = _as_date(s["date"])
        if s_date <= end_date:
            sales_by_date[s_date].append(s)

    waste_by_date: dict[date, list[Mapping[str, Any]]] = defaultdict(list)
    for w in waste_logs:
        w_date = _as_date(w["date"])
        if w_date <= end_date:
            waste_by_date[w_date].append(w)

    first_dates = [
        min(batches_by_date.keys()) if batches_by_date else None,
        min(sales_by_date.keys()) if sales_by_date else None,
        min(waste_by_date.keys()) if waste_by_date else None,
    ]
    valid_first = [d for d in first_dates if d is not None]
    if not valid_first:
        return inv

    start_date = min(valid_first)
    current = start_date
    while current <= end_date:
        inv.expire(current)
        for b in batches_by_date.get(current, []):
            inv.add_batch(b)
        for s in sales_by_date.get(current, []):
            prod_id = int(s["product_id"])
            sale_qty = float(s["qty"])
            for r in recipes.get(prod_id, []):
                ing_id = int(r["ingredient_id"])
                req_qty = sale_qty * float(r["qty"])
                inv.consume(ing_id, req_qty, current)
        for w in waste_by_date.get(current, []):
            ing_id = int(w["ingredient_id"])
            qty = float(w["qty"])
            reason = str(w.get("reason", "manual"))
            inv.discard(ing_id, qty, current, reason)
        current += timedelta(days=1)

    return inv


def _daily_usage(needs: Mapping[date | str, float] | Sequence[Mapping[str, Any]]) -> dict[date, float]:
    if isinstance(needs, Mapping):
        return {_as_date(day): max(0.0, float(qty)) for day, qty in needs.items()}
    return {_as_date(row["date"]): max(0.0, float(row.get("need", row.get("qty", 0.0)))) for row in needs}


def _simulate(batches: Sequence[Mapping[str, Any]], usage: Mapping[date, float], start: date, days: int) -> dict[str, Any]:
    active = []
    for batch in batches:
        qty = max(0.0, float(batch.get("qty", 0.0)))
        if qty <= EPSILON:
            continue
        active.append({
            **batch,
            "qty": qty,
            "expiry_date": _as_date(batch["expiry_date"]),
            "unit_price": max(0.0, float(batch.get("unit_price", batch.get("price", 0.0)) or 0.0)),
        })
    active.sort(key=lambda b: (b["expiry_date"], int(b.get("id", 0) or 0)))
    waste, shortages, daily = [], [], []
    for offset in range(1, days + 1):
        day = start + timedelta(days=offset)
        keep = []
        for batch in active:
            if batch["expiry_date"] < day:
                if batch["qty"] > EPSILON:
                    waste.append({
                        "date": batch["expiry_date"],
                        "qty": batch["qty"],
                        "value": batch["qty"] * batch["unit_price"],
                        "batch_id": batch.get("id"),
                    })
            else:
                keep.append(batch)
        active = keep
        need = usage.get(day, 0.0)
        remaining = need
        for batch in active:
            if remaining <= EPSILON:
                break
            taken = min(batch["qty"], remaining)
            batch["qty"] -= taken
            remaining -= taken
        active = [batch for batch in active if batch["qty"] > EPSILON]
        if remaining > EPSILON:
            shortages.append({"date": day, "qty": remaining})
        daily.append({"date": day, "need": need, "shortage": max(0.0, remaining)})

    waste_qty = sum(row["qty"] for row in waste)
    waste_value = sum(row["value"] for row in waste)
    initial_value = sum(float(b.get("qty", 0.0)) * float(b.get("unit_price", b.get("price", 0.0)) or 0.0) for b in batches)
    initial_qty = sum(float(b.get("qty", 0.0)) for b in batches)
    return {
        "waste": waste,
        "waste_qty": waste_qty,
        "waste_value": waste_value,
        "shortages": shortages,
        "daily": daily,
        "remaining_batches": active,
        "stock_value": initial_value,
        "stock_qty": initial_qty,
    }


def simulate_fefo_60_days(
    batches: Sequence[Mapping[str, Any]],
    daily_needs: Mapping[date | str, float] | Sequence[Mapping[str, Any]],
    *,
    start_date: date | str | None = None,
    planned_buy: float = 0.0,
    planned_expiry_date: date | str | None = None,
    unit_price: float = 0.0,
    unit_step: float = 1.0,
    days: int = PROJECTION_DAYS,
) -> dict[str, Any]:
    """Simulate T+1..T+60, expiring batches before consumption and consuming FEFO.

    ``start_date`` is T. A batch remains usable on its expiry date, as specified by
    the domain rule (expiry_date < simulated calendar date means expired).
    """
    if days < 1:
        raise ValueError("days harus minimal 1")
    if unit_step <= 0:
        raise ValueError("unit_step harus lebih besar dari 0")
    needs = _daily_usage(daily_needs)
    if start_date is None:
        start = min(needs) - timedelta(days=1) if needs else date.today()
    else:
        start = _as_date(start_date)

    base = _simulate(batches, needs, start, days)
    buy = max(0.0, float(planned_buy))
    planned_expiry = _as_date(planned_expiry_date) if planned_expiry_date else start + timedelta(days=days)
    plan_batch = {"id": 2**63 - 1, "qty": buy, "expiry_date": planned_expiry, "unit_price": max(0.0, unit_price)}
    with_plan_batches = [*batches, plan_batch] if buy > EPSILON else list(batches)
    with_plan = _simulate(with_plan_batches, needs, start, days)

    # Safe-buy step down: find largest multiple of unit_step <= buy that avoids extra waste
    safe_buy = buy
    if buy > EPSILON and with_plan["waste_qty"] > base["waste_qty"] + unit_step / 2:
        safe_buy = 0.0
        steps = int(math.ceil(buy / unit_step))
        for step_count in range(steps, 0, -1):
            candidate = round(step_count * unit_step, 6)
            if candidate >= buy:
                continue
            candidate_batch = {**plan_batch, "qty": candidate}
            trial = _simulate([*batches, candidate_batch], needs, start, days)
            if trial["waste_qty"] <= base["waste_qty"] + unit_step / 2:
                safe_buy = candidate
                break

    # Calculate ratio: monetary value ratio with fallback to quantity ratio
    total_stock_value = base["stock_value"] + buy * max(0.0, unit_price)
    total_stock_qty = base["stock_qty"] + buy
    if total_stock_value > EPSILON:
        ratio = with_plan["waste_value"] / total_stock_value
    elif total_stock_qty > EPSILON:
        ratio = with_plan["waste_qty"] / total_stock_qty
    else:
        ratio = 0.0

    ratio_check = round(ratio, 6)
    if with_plan["waste_qty"] <= EPSILON:
        risk_level = None
    elif ratio_check < 0.10:
        risk_level = "rendah"
    elif ratio_check <= 0.30:
        risk_level = "sedang"
    else:
        risk_level = "tinggi"

    return {
        "days": days,
        "start_date": start,
        "end_date": start + timedelta(days=days),
        "waste": with_plan["waste"],
        "waste_qty": with_plan["waste_qty"],
        "waste_value": with_plan["waste_value"],
        "ratio": ratio,
        "risk_level": risk_level,
        "safe_buy": safe_buy,
        "base_waste_qty": base["waste_qty"],
        "shortages": with_plan["shortages"],
        "daily": with_plan["daily"],
        "remaining_batches": with_plan["remaining_batches"],
    }
