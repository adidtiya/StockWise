from __future__ import annotations

from datetime import date

from sqlalchemy import CheckConstraint, Date, Double, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class WasteLog(Base):
    __tablename__ = "waste_logs"
    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_waste_logs_qty"),
        Index("idx_waste_user_date", "user_id", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    ingredient_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
    )
    qty: Mapped[float] = mapped_column(Double, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)

    user = relationship("User", back_populates="waste_logs")
    ingredient = relationship("Ingredient", back_populates="waste_logs")

