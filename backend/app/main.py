import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from backend.app.catalog.router import router as catalog_router
from backend.app.price_sources.epiceries_ca import EpiceriesClient


def create_app(enabled: bool | None = None, transport: httpx.AsyncBaseTransport | None = None,
               interval: float = 1.0) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configured = os.getenv('EPICERIES_ENABLED', 'false').lower()
        if configured not in ('true', 'false'):
            raise ValueError('EPICERIES_ENABLED doit être true ou false')
        app.state.stale_days = int(os.getenv('EPICERIES_STALE_DAYS', '7'))
        if app.state.stale_days < 1:
            raise ValueError('EPICERIES_STALE_DAYS doit être positif')
        async with httpx.AsyncClient(timeout=10, transport=transport, follow_redirects=False,
                                     headers={'User-Agent': 'OptiMeal/0.1', 'Accept': 'application/json'}) as http:
            app.state.epiceries = EpiceriesClient(http, enabled if enabled is not None else configured == 'true', interval)
            yield

    app = FastAPI(title='OptiMeal', version='0.1.0', lifespan=lifespan)
    # Le catalogue expose pour le moment les routes de la source épiceries.ca.
    app.include_router(catalog_router)

    @app.get('/health', tags=['serveur'])
    async def health():
        return {'status': 'ok'}

    return app


app = create_app()
