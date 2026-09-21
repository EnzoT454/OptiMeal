from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Query, Request

from backend.app.price_sources.epiceries_ca import provenance
from backend.app.price_sources.normalize import normalize
from backend.app.price_sources.schemas import Categories, Product, SearchPage, Store
from backend.app.catalog.service import NON_FOOD_CATEGORY_IDS, filter_and_rank_search_results

router = APIRouter(prefix='/sources/epiceries', tags=['épiceries.ca'])


@router.get('/categories')
async def categories(request: Request):
    snapshot, cached = await request.app.state.epiceries.get('categories', {}, Categories)
    return {'data': snapshot.data, 'source': provenance(snapshot, cached)}


@router.get('/search')
async def search(request: Request, q: Annotated[str | None, Query(min_length=2, max_length=200)] = None,
                 category: Annotated[int | None, Query(ge=1, le=71)] = None,
                 store: Store | None = None, discounted: bool | None = None,
                 sort: Literal['updated_desc', 'price_asc', 'price_desc'] = 'updated_desc',
                 limit: Annotated[int, Query(ge=1, le=100)] = 20,
                 offset: Annotated[int, Query(ge=0)] = 0,
                 food_only: bool = True):
    if q is not None and len(q.strip()) < 2:
        raise HTTPException(422, 'Le texte doit contenir au moins deux caractères non blancs.')
    if all(value is None for value in (q, category, store, discounted)):
        raise HTTPException(422, 'Au moins un filtre est requis : q, category, store, discounted.')
    snapshot, cached = await request.app.state.epiceries.get('search', {
        'q': q.strip() if q else None, 'category': category, 'store': store,
        'discounted': str(discounted).lower() if discounted is not None else None,
        'sort': sort, 'limit': limit, 'offset': offset}, SearchPage)
    results, excluded_count = filter_and_rank_search_results(
        snapshot.data['results'], q, food_only, category is not None,
        food_only and sort == 'updated_desc')
    data = {**snapshot.data, 'results': results, 'count': len(results)}
    return {
        'data': data,
        'source': provenance(snapshot, cached),
        'filter': {
            'food_only': food_only and category is None,
            'excluded_category_ids': sorted(NON_FOOD_CATEGORY_IDS) if food_only and category is None else [],
            'provider_count': snapshot.data['count'],
            'excluded_count': excluded_count,
            'ranking': 'query_name_relevance' if q and food_only and sort == 'updated_desc' else 'provider_order',
        },
    }


@router.get('/products/{product_id}')
async def product(request: Request, product_id: Annotated[str, Path(pattern=r'^[a-zA-Z0-9]{1,64}$')]):
    snapshot, cached = await request.app.state.epiceries.get('product', {'id': product_id}, Product)
    if snapshot.data['id'] != product_id:
        raise HTTPException(502, 'Identifiant fournisseur incohérent.')
    return {'schema_version': '1.0', 'offers': normalize(snapshot, request.app.state.stale_days),
            'raw': snapshot.data, 'source': provenance(snapshot, cached)}
