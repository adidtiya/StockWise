from __future__ import annotations

from sqlalchemy import Boolean, Double, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[float] = mapped_column(Double, nullable=False, default=0.0, server_default="0")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    user = relationship("User", back_populates="products")
    recipes = relationship("Recipe", back_populates="product", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="product", cascade="all, delete-orphan")

