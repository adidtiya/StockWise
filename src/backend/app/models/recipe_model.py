from __future__ import annotations

from sqlalchemy import CheckConstraint, Double, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_recipes_qty"),
    )

    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ingredient_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        primary_key=True,
    )
    qty: Mapped[float] = mapped_column(Double, nullable=False)

    product = relationship("Product", back_populates="recipes")
    ingredient = relationship("Ingredient", back_populates="recipes")

