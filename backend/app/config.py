"""Configuration centralisée lue depuis les variables d'environnement."""
from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    """Valeurs partagées par les modules lorsque PostgreSQL et JWT seront activés."""

    database_url: str | None = os.getenv('DATABASE_URL')
    jwt_secret: str | None = os.getenv('JWT_SECRET')
    epiceries_enabled: bool = os.getenv('EPICERIES_ENABLED', 'false').lower() == 'true'
    epiceries_stale_days: int = int(os.getenv('EPICERIES_STALE_DAYS', '7'))


settings = Settings()
