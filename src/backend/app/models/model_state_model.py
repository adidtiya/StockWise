from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Double, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.connections.postgres import Base


class ModelState(Base):
    __tablename__ = "model_state"

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    alpha: Mapped[float] = mapped_column(Double, nullable=False, default=0.2, server_default="0.2")
    wape: Mapped[float | None] = mapped_column(Double, nullable=True)
    samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="model_state")

