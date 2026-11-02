from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback_model import Feedback


class FeedbackRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, *, user_id: int, rating: int, category: str, message: str) -> Feedback:
        row = Feedback(user_id=user_id, rating=rating, category=category, message=message)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

