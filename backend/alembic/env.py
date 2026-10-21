"""Une seule chaîne Alembic, limitée aux tables applicatives enregistrées."""
from alembic import context
from alembic.util import CommandError
from sqlalchemy.exc import SQLAlchemyError

from backend.app.config import load_settings
from backend.app.database import Base, Database
# Importer ici les modèles implémentés pour enregistrer leurs métadonnées.
from backend.app.catalog import models  # noqa: F401
from backend.app.recipes import models as recipe_models  # noqa: F401
from backend.app.accounts import models as account_models  # noqa: F401

config = context.config
target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    if type_ == 'schema':
        # Le schéma public reste implicite dans les modèles, comme en réflexion
        # PostgreSQL, pour comparer correctement leurs clés étrangères.
        return name is None
    if type_ == 'table':
        # Ne jamais proposer de suppression pour une table hors de nos modèles.
        return name in target_metadata.tables
    return True


def configure(connection=None):
    options = dict(
        target_metadata=target_metadata, include_schemas=True,
        include_name=include_name, version_table_schema='public', compare_type=True,
    )
    if connection is None:
        context.configure(dialect_name='postgresql', literal_binds=True, **options)
    else:
        context.configure(connection=connection, **options)
    with context.begin_transaction():
        context.run_migrations()


def run_online():
    # Une connexion injectée sert aux tests transactionnels et aux outils locaux.
    connection = config.attributes.get('connection')
    if connection is not None:
        configure(connection)
        return
    database = Database(load_settings().database_url)
    try:
        if database.engine is None:
            raise CommandError('DATABASE_URL absente ou invalide pour PostgreSQL/Psycopg.')
        with database.engine.connect() as connection:
            configure(connection)
    except SQLAlchemyError as exc:
        raise CommandError(
            f'Migration PostgreSQL impossible ({type(exc).__name__}). '
            'Vérifier la connexion et la révision de la base.'
        ) from None
    finally:
        database.dispose()


if context.is_offline_mode():
    configure()
else:
    run_online()
