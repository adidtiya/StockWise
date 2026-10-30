from __future__ import annotations

from pydantic import BaseModel, Field


class FeedbackCreateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    category: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=2000)

