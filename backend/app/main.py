import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.catalog.router import router as catalog_router
from backend.app.catalog.schemas import CatalogExport


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        catalog_path = os.getenv('CATALOG_IMPORT_PATH')
        app.state.imported_catalog = None
        if catalog_path:
            app.state.imported_catalog = CatalogExport.model_validate_json(
                Path(catalog_path).read_text(encoding='utf-8'))
        yield

    app = FastAPI(title='OptiMeal', version='0.1.0', lifespan=lifespan)
    app.include_router(catalog_router)

    @app.get('/health', tags=['serveur'])
    async def health():
        return {'status': 'ok'}

    return app


app = create_app()
