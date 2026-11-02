from __future__ import annotations

from sqlalchemy import CheckConstraint, Double, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class Ingredient(Base):
    __tablename__ = "ingredients"
    __table_args__ = (
        CheckConstraint("category IN ('segar', 'tahan_lama')", name="ck_ingredients_category"),
        CheckConstraint("shelf_life_days >= 1", name="ck_ingredients_shelf_life"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    shelf_life_days: Mapped[int] = mapped_column(Integer, nullable=False)
    min_stock: Mapped[float] = mapped_column(Double, nullable=False, default=0.0, server_default="0")
    price: Mapped[float] = mapped_column(Double, nullable=False, default=0.0, server_default="0")

    user = relationship("User", back_populates="ingredients")
    recipes = relationship("Recipe", back_populates="ingredient", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="ingredient", cascade="all, delete-orphan")
    waste_logs = relationship("WasteLog", back_populates="ingredient", cascade="all, delete-orphan")

