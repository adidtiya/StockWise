from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.feedback.repository import FeedbackRepository
from app.api.feedback.schema import FeedbackCreateRequest


class FeedbackUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = FeedbackRepository(db)

    async def submit(self, user, body: FeedbackCreateRequest) -> None:
        await self.repo.create(user_id=user.id, rating=body.rating,
                               category=body.category.strip(), message=body.message.strip())

