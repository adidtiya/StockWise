from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('freemium', 'pro')", name="ck_users_role"),
        CheckConstraint(
            "business_type IN ('katering', 'warung', 'rumah_makan')",
            name="ck_users_business_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="freemium", server_default="freemium")
    pro_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    business_name: Mapped[str] = mapped_column(String(150), nullable=False)
    business_type: Mapped[str] = mapped_column(String(30), nullable=False)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    ingredients = relationship("Ingredient", back_populates="user", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="user", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="user", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="user", cascade="all, delete-orphan")
    waste_logs = relationship("WasteLog", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")
    model_state = relationship("ModelState", back_populates="user", uselist=False, cascade="all, delete-orphan")
    integrations = relationship("Integration", back_populates="user", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    feedbacks = relationship("Feedback", back_populates="user")

