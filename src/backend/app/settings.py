from __future__ import annotations

import os
from pathlib import Path
from typing import List
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

ENV_DIR = Path(__file__).resolve().parent / "config" / "env"
DEFAULT_ENV_FILE = ENV_DIR / "development.env"
FALLBACK_ENV_FILE = ENV_DIR / "development.env.example"


def _normalize_database_url(raw_url: str, require_ssl: bool) -> str:
    """Normalisasi URL database agar sesuai dengan driver asyncpg.

    - Mengubah skema ``postgres://``/``postgresql://`` menjadi ``postgresql+asyncpg://``.
    - Mengubah parameter ``sslmode`` (libpq) menjadi ``ssl`` (asyncpg).
    - Menambahkan ``ssl=require`` bila SSL diwajibkan dan belum ada di URL.
    """
    scheme_replacements = {
        "postgres://": "postgresql+asyncpg://",
        "postgresql://": "postgresql+asyncpg://",
    }
    for prefix, replacement in scheme_replacements.items():
        if raw_url.lower().startswith(prefix):
            raw_url = replacement + raw_url[len(prefix):]
            break

    if not raw_url.lower().startswith("postgresql+asyncpg://"):
        raise ValueError(
            "DATABASE_URL harus diawali postgresql://, postgres://, "
            "atau postgresql+asyncpg://"
        )

    parts = urlsplit(raw_url)
    query: list[tuple[str, str]] = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            key = "ssl"
        if key == "ssl":
            lowered = value.lower()
            if lowered in ("true", "1", "yes", "on"):
                value = "require"
            elif lowered in ("false", "0", "no", "off"):
                value = "disable"
        query.append((key, value))

    if require_ssl and not any(key == "ssl" for key, _ in query):
        query.append(("ssl", "require"))

    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # pragma: no cover

    class SettingsConfigDict(dict):  # type: ignore[no-redef]
        pass

    class BaseSettings:  # type: ignore[no-redef]
        def __init__(self, **kwargs):
            env_values: dict[str, str] = {}
            for env_path in (FALLBACK_ENV_FILE, DEFAULT_ENV_FILE):
                if env_path.is_file():
                    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                        line = raw_line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        env_values[k.strip()] = v.strip()
            annotations = getattr(self.__class__, "__annotations__", {})
            for field_name, field_type in annotations.items():
                default_val = getattr(self.__class__, field_name, None)
                raw = kwargs.get(field_name, os.environ.get(field_name, env_values.get(field_name, default_val)))
                if field_type in (int, "int") and raw is not None:
                    raw = int(raw)
                if field_type in (bool, "bool") and raw is not None:
                    raw = str(raw).strip().lower() in ("1", "true", "yes", "on")
                setattr(self, field_name, raw)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(FALLBACK_ENV_FILE), str(DEFAULT_ENV_FILE)),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_ENV: str = "development"

    POSTGRES_USER: str = "stockwise_user"
    POSTGRES_PASSWORD: str = "stockwise_password"
    POSTGRES_DB: str = "stockwise_db"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    DATABASE_URL: str = ""
    DATABASE_SSL: bool = False
    MIGRATION_DATABASE_URL: str = ""
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE: int = 1800
    DB_STATEMENT_CACHE_SIZE: int = -1

    JWT_SECRET: str = "ganti_dengan_string_acak_panjang_minimal_32_karakter"
    JWT_ALGORITHM: str = "HS256"
    CORS_ORIGINS: str = "http://localhost:5173"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_DEFAULT: str = "60/minute"

    @property
    def database_url(self) -> str:
        raw_override = self.DATABASE_URL.strip()
        if raw_override:
            return _normalize_database_url(raw_override, self.DATABASE_SSL)

        user = quote(self.POSTGRES_USER, safe="")
        password = quote(self.POSTGRES_PASSWORD, safe="")
        host = self.POSTGRES_HOST
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        database = quote(self.POSTGRES_DB, safe="")
        url = f"postgresql+asyncpg://{user}:{password}@{host}:{self.POSTGRES_PORT}/{database}"
        if self.DATABASE_SSL:
            url += "?ssl=require"
        return url

    @property
    def migration_database_url(self) -> str:
        raw_override = self.MIGRATION_DATABASE_URL.strip()
        if raw_override:
            return _normalize_database_url(raw_override, self.DATABASE_SSL)
        return self.database_url

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()

