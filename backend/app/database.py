"""Moteur PostgreSQL par application et session fermée après chaque requête."""
from collections.abc import Iterator

from fastapi import HTTPException, Request
from sqlalchemy import Engine, MetaData, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Métadonnées communes à toutes les futures tables applicatives."""

    metadata = MetaData(naming_convention={
        'pk': 'pk_%(table_name)s',
        'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s',
        'uq': 'uq_%(table_name)s_%(column_0_name)s',
        'ix': 'ix_%(table_name)s_%(column_0_name)s',
        'ck': 'ck_%(table_name)s_%(constraint_name)s',
    })


class Database:
    """Créer le moteur n'ouvre aucune connexion ; SELECT 1 vérifie le réseau."""

    def __init__(self, url: str | None):
        self.engine: Engine | None = None
        self.session_factory: sessionmaker[Session] | None = None
        if not url:
            return
        try:
            parsed = make_url(url)
            if parsed.drivername == 'postgresql':
                parsed = parsed.set(drivername='postgresql+psycopg')
            if parsed.drivername != 'postgresql+psycopg':
                return
            self.engine = create_engine(
                parsed, pool_pre_ping=True, connect_args={'connect_timeout': 10},
            )
            self.session_factory = sessionmaker(bind=self.engine)
        except (SQLAlchemyError, ValueError, ImportError):
            # Une configuration invalide bloque seulement les accès DB.
            # Ne pas recopier l'URL ou le message du pilote dans une réponse.
            self.engine = None

    def dispose(self) -> None:
        self.session_factory = None
        if self.engine is not None:
            self.engine.dispose()
            self.engine = None


def get_db(request: Request) -> Iterator[Session]:
    factory = request.app.state.database.session_factory
    if factory is None:
        raise HTTPException(status_code=503, detail='Database unavailable')
    try:
        with factory() as db:
            yield db
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail='Database unavailable') from None
