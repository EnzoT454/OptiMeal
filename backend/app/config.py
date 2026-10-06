"""Configuration centralisée lue depuis les variables d'environnement."""
from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    """Valeurs partagées par les modules lorsque PostgreSQL et JWT seront activés."""

    database_url: str | None = os.getenv('DATABASE_URL')
    jwt_secret: str | None = os.getenv('JWT_SECRET')
    catalog_import_path: str | None = os.getenv('CATALOG_IMPORT_PATH') or None


settings = Settings()
