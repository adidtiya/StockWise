from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_model import User


async def get_other_user_by_email(
    db: AsyncSession,
    email: str,
    exclude_user_id: int,
) -> Optional[User]:
    normalized = email.strip().lower()
    result = await db.execute(
        select(User).where(
            func.lower(User.email) == normalized,
            User.id != exclude_user_id,
        )
    )
    return result.scalar_one_or_none()


async def update_user_fields(
    db: AsyncSession,
    user: User,
    updates: dict[str, Any],
) -> User:
    for key, value in updates.items():
        setattr(user, key, value)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user_by_id(db: AsyncSession, user_id: int) -> None:
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

