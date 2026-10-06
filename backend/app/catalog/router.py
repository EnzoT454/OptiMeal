"""Lecture du catalogue choisi par le serveur, sans appel externe facturable."""
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from .schemas import CatalogExport

router = APIRouter(prefix='/catalog', tags=['catalogue importé'])


@router.get('', response_model=CatalogExport)
def imported_catalog(request: Request):
    catalog = request.app.state.imported_catalog
    if catalog is None:
        raise HTTPException(503, 'Aucun catalogue configuré : définir CATALOG_IMPORT_PATH puis redémarrer.')
    return catalog


@router.get('/offers')
def offers(request: Request, ingredient_id: str | None = None,
           limit: Annotated[int, Query(ge=1, le=100)] = 20,
           offset: Annotated[int, Query(ge=0)] = 0):
    catalog = imported_catalog(request)
    selected = catalog.offers
    if ingredient_id is not None:
        if ingredient_id not in {i.id for i in catalog.ingredients}:
            raise HTTPException(404, 'Ingrédient inconnu dans ce catalogue.')
        ids = {m.product_id for m in catalog.matches
               if m.ingredient_id == ingredient_id and m.status == 'suggested'}
        selected = [o for o in selected if o.product_id in ids]
    page = selected[offset:offset + limit]
    product_ids = {o.product_id for o in page}
    return {'status': catalog.status, 'dataset_kind': catalog.dataset_kind,
            'evaluated_at': catalog.evaluated_at, 'total': len(selected),
            'offers': page, 'products': [p for p in catalog.products if p.id in product_ids],
            'warnings': catalog.warnings}
