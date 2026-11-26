from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from app.settings import settings

try:
    from sqlalchemy.ext.asyncio import (
        AsyncEngine,
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from sqlalchemy.orm import declarative_base

    connect_args: dict[str, Any] = {}
    if settings.DB_STATEMENT_CACHE_SIZE >= 0:
        connect_args["statement_cache_size"] = settings.DB_STATEMENT_CACHE_SIZE
        connect_args["prepared_statement_cache_size"] = settings.DB_STATEMENT_CACHE_SIZE

    engine: AsyncEngine = create_async_engine(
        settings.database_url,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_pre_ping=True,
        connect_args=connect_args,
        echo=False,
    )

    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    Base = declarative_base()

except ImportError:  # pragma: no cover

    class _FallbackEngine:
        def __init__(self, url: str, **kwargs: Any) -> None:
            self.url = url
            self.kwargs = kwargs

    class _FallbackSession:
        async def __aenter__(self) -> "_FallbackSession":
            return self

        async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
            pass

        async def close(self) -> None:
            pass

    class Base:  # type: ignore[no-redef]
        metadata = None

    engine = _FallbackEngine(  # type: ignore[assignment]
        settings.database_url,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_pre_ping=True,
        echo=False,
    )
    AsyncSessionLocal = _FallbackSession  # type: ignore[assignment]


async def get_async_session() -> AsyncGenerator[Any, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


__all__ = ["engine", "AsyncSessionLocal", "Base", "get_async_session"]

