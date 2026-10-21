from pathlib import Path
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.config import ENV_FILE, Settings, load_settings
from backend.app.database import Database, get_db
from backend.app.catalog.router import router as catalog_router
from backend.app.catalog.schemas import CatalogExport
from backend.app.common.public_data import (
    DEFAULT_CATALOG,
    ROOT,
    load_catalog,
)
from backend.app.common.public_router import (
    install_error_handlers,
    router as public_router,
)
from backend.app.recipes.router import router as recipes_router
from backend.app.accounts.router import router as accounts_router
from backend.app.security import SupabaseAuth


class DatabaseHealth(BaseModel):
    status: Literal['ok']
    database: Literal['reachable']


def create_app(*, settings: Settings | None = None, env_file: Path | None = ENV_FILE) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = settings if settings is not None else load_settings(env_file)
        database = Database(config.database_url)
        app.state.database = database
        app.state.auth = SupabaseAuth(config.supabase_url, config.supabase_publishable_key)
        try:
            load_local_data(app, config)
            yield
        finally:
            database.dispose()
            app.state.auth.close()

    def load_local_data(app: FastAPI, config: Settings) -> None:
        catalog_path = config.catalog_import_path
        app.state.imported_catalog = None

        if catalog_path:
            app.state.imported_catalog = CatalogExport.model_validate_json(
                Path(catalog_path).read_text(encoding="utf-8")
            )

        app.state.public_catalog = None

        try:
            app.state.public_catalog = load_catalog(
                ROOT / (config.common_catalog_path or DEFAULT_CATALOG)
            )
        except (OSError, ValueError, KeyError, TypeError):
            pass

    app = FastAPI(
        title="OptiMeal",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.include_router(catalog_router)
    app.include_router(public_router)
    app.include_router(recipes_router)
    app.include_router(accounts_router)
    install_error_handlers(app)

    @app.get("/health", tags=["serveur"])
    async def health():
        return {"status": "ok"}

    # Vérifier la connexion à Supabase
    @app.get("/health/db", tags=["serveur"], response_model=DatabaseHealth,
             responses={503: {'description': 'Base non configurée, invalide ou inaccessible'}})
    def health_db(db: Session = Depends(get_db)) -> DatabaseHealth:
        if db.execute(text("SELECT 1")).scalar_one() != 1:
            raise HTTPException(
                status_code=503,
                detail="Database unavailable",
            )
        return DatabaseHealth(status='ok', database='reachable')

    return app


app = create_app()
