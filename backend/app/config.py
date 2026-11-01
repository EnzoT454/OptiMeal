"""Configuration chargée au démarrage, sans modifier l'environnement global."""
from dataclasses import dataclass, field
import os
from pathlib import Path

from dotenv import dotenv_values

ENV_FILE = Path(__file__).resolve().parents[1] / '.env'


@dataclass(frozen=True)
class Settings:
    """Une configuration par application ; les secrets sont exclus du repr."""

    database_url: str | None = field(default=None, repr=False)
    jwt_secret: str | None = field(default=None, repr=False)
    supabase_url: str | None = None
    supabase_publishable_key: str | None = field(default=None, repr=False)
    # Clé secrète Supabase : import des circulaires et suppression de compte côté serveur, jamais dans l'app.
    supabase_secret_key: str | None = field(default=None, repr=False)
    catalog_import_path: str | None = None
    common_catalog_path: str | None = None
    recipe_seed_path: str | None = None
    # Source des offres /api/v1/offers : 'database' (PostgreSQL) ou 'json' (par défaut).
    offers_source: str | None = None


def load_settings(env_file: Path | None = ENV_FILE) -> Settings:
    values = dict(dotenv_values(env_file)) if env_file is not None else {}
    # Même une variable exportée vide prévaut sur .env : DATABASE_URL=""
    # permet de désactiver volontairement la connexion pour une exécution.
    values.update(os.environ)
    for key in ('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'):
        if key not in values:
            values[key] = values.get('EXPO_PUBLIC_' + key)
    return Settings(**{
        name: values.get(name.upper()) or None for name in Settings.__dataclass_fields__
    })
