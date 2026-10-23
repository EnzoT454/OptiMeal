"""Première API commune de lecture pour développer les deux onglets."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.catalog.common_schemas import IngredientRead, OfferRead
from backend.app.common.contracts import Detail, ErrorResponse, IngredientId, Page, ResponseMeta, Retailer
from backend.app.common.public_data import PublicCatalog, search_text, today

router = APIRouter(prefix='/api/v1', tags=['Recettes et Promos v1'], responses={
    404: {'model': ErrorResponse}, 422: {'model': ErrorResponse}, 503: {'model': ErrorResponse},
})
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
Search = Annotated[str, Query(max_length=200)]


def fail(status: int, code: str, message: str):
    raise HTTPException(status, detail={'code': code, 'message': message})


def catalog(request: Request) -> PublicCatalog:
    if request.app.state.public_catalog is None:
        fail(503, 'CATALOG_UNAVAILABLE', 'Le catalogue commun est indisponible ou invalide.')
    return request.app.state.public_catalog


def meta(kind='source_snapshot') -> ResponseMeta:
    warnings = (['recipe_drafts_require_review'] if kind == 'demo' else
                ['source_prices_not_currently_verified', 'ingredient_product_mapping_requires_review',
                 'source_units_not_normalized'])
    return ResponseMeta(dataset_kind=kind, warnings=warnings)


def page(items, limit: int, offset: int, kind='source_snapshot') -> dict:
    return {'items': items[offset:offset + limit], 'total': len(items),
            'limit': limit, 'offset': offset, 'meta': meta(kind)}


@router.get('/ingredients', response_model=Page[IngredientRead])
def list_ingredients(request: Request, q: Search = '', limit: Limit = 20, offset: Offset = 0):
    query = search_text(q.strip())
    items = [i for i in catalog(request).ingredients
             if any(query in search_text(value) for value in [i.name, *i.aliases])]
    return page(items, limit, offset)


@router.get('/offers', response_model=Page[OfferRead])
def list_offers(request: Request, ingredient_id: IngredientId | None = None,
                retailer: Retailer | None = None, store_id: str | None = None,
                category_id: int | None = None,
                promotion_only: bool = False, on_date: date | None = None,
                limit: Limit = 20, offset: Offset = 0):
    data = catalog(request)
    if ingredient_id is not None and ingredient_id not in {i.id for i in data.ingredients}:
        fail(404, 'INGREDIENT_NOT_FOUND', 'Ingrédient introuvable.')
    items = [o for o in data.offers(on_date or today())
             if (ingredient_id is None or o.ingredient_id == ingredient_id)
             and (retailer is None or o.retailer == retailer)
             and (store_id is None or o.store_id == store_id)
             and (category_id is None or o.category_id == category_id)
             and (not promotion_only or o.promotion.status == 'active')]
    return page(items, limit, offset)


@router.get('/offers/{offer_id}', response_model=Detail[OfferRead])
def get_offer(offer_id: str, request: Request, on_date: date | None = None):
    item = next((o for o in catalog(request).offers(on_date or today()) if o.id == offer_id), None)
    if item is None:
        fail(404, 'OFFER_NOT_FOUND', 'Offre introuvable dans cette capture.')
    return {'item': item, 'meta': meta()}


def install_error_handlers(app):
    """Le format v1 ne change pas les erreurs des routes historiques."""
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        if not request.url.path.startswith('/api/v1/'):
            return await http_exception_handler(request, exc)
        detail = exc.detail if isinstance(exc.detail, dict) else {
            'code': f'HTTP_{exc.status_code}', 'message': str(exc.detail),
        }
        error = ErrorResponse(error={**detail, 'details': []})
        return JSONResponse(status_code=exc.status_code, content=error.model_dump(), headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        if not request.url.path.startswith('/api/v1/'):
            return await request_validation_exception_handler(request, exc)
        details = [{'field': '.'.join(str(part) for part in e['loc']), 'message': e['msg']}
                   for e in exc.errors()]
        error = ErrorResponse(error={'code': 'VALIDATION_ERROR', 'message': 'Paramètres invalides.',
                                    'details': details})
        return JSONResponse(status_code=422, content=error.model_dump())