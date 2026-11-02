from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Double, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("idx_events_user_date", "user_id", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    impact: Mapped[float] = mapped_column(Double, nullable=False, default=1.0, server_default="1")
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="custom", server_default="custom")

    user = relationship("User", back_populates="events")

