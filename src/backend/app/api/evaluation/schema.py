from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class ProductEvaluation(BaseModel):
    product_id: int
    product_name: str
    accuracy: float | None
    bias: str | None = None


class ModelEvaluation(BaseModel):
    alpha: float
    wape: float | None
    samples: int
    history_days: int
    trained_at: datetime | None


class EvaluationData(BaseModel):
    accuracy: float | None
    accuracy_prev: float | None
    model: ModelEvaluation
    products: list[ProductEvaluation]


class TrainData(BaseModel):
    trained: bool
    optimal_alpha: float
    wape: float | None
    samples: int
