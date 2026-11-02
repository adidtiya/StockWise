from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def run_migrations() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    alembic_ini_path = backend_dir / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "db_migrations"))
    command.upgrade(alembic_cfg, "head")


if __name__ == "__main__":
    run_migrations()

