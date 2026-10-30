from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_model import User


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    normalized = email.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == normalized))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user_record(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password_hash: str,
    business_name: str,
    business_type: str,
    city: Optional[str] = None,
    phone: Optional[str] = None,
    role: str = "freemium",
    pro_until: Optional[date] = None,
) -> User:
    user = User(
        name=name.strip(),
        email=email.strip().lower(),
        password_hash=password_hash,
        role=role,
        pro_until=pro_until,
        business_name=business_name.strip(),
        business_type=business_type,
        city=city.strip() if city else None,
        phone=phone.strip() if phone else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

