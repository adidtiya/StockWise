from __future__ import annotations

import os
from pathlib import Path
from typing import List

ENV_DIR = Path(__file__).resolve().parent / "config" / "env"
DEFAULT_ENV_FILE = ENV_DIR / "development.env"
FALLBACK_ENV_FILE = ENV_DIR / "env.example"

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

    JWT_SECRET: str = "ganti_dengan_string_acak_panjang_minimal_32_karakter"
    JWT_ALGORITHM: str = "HS256"
    CORS_ORIGINS: str = "http://localhost:5173"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_DEFAULT: str = "60/minute"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()

