"""Catalogue de recettes lu dans PostgreSQL via la connexion serveur."""
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.app.common.contracts import Detail, ErrorResponse, Page, ResponseMeta
from backend.app.common.public_router import Limit, Offset, Search, fail
from backend.app.database import get_db
from backend.app.security import CurrentUser, current_user, optional_user, auth_error
from . import service
from .schemas import RecipeRead, RecipeSummary, RecipeWrite

router = APIRouter(prefix='/api/v1/recipes', tags=['Recettes v1'], responses={
    401: {'model': ErrorResponse}, 404: {'model': ErrorResponse},
    422: {'model': ErrorResponse}, 503: {'model': ErrorResponse},
})


def recipe_db(request: Request) -> Iterator[Session]:
    try:
        yield from get_db(request)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        fail(503, 'RECIPES_UNAVAILABLE', 'Les recettes sont indisponibles. Vérifier la connexion et les migrations.')
    except ValidationError:
        fail(503, 'RECIPES_UNAVAILABLE', 'Les données des recettes sont invalides.')


def recipe_meta(kind='demo') -> ResponseMeta:
    return ResponseMeta(data_source='postgresql', dataset_kind=kind,
                        review_required=kind != 'user_content',
                        warnings=['recipe_drafts_require_review'] if kind != 'user_content' else [])


@router.get('', response_model=Page[RecipeSummary])
def list_recipes(q: Search = '', quick: bool = False, limit: Limit = 20, offset: Offset = 0,
                 favorites: bool = False, user: CurrentUser | None = Depends(optional_user),
                 db: Session = Depends(recipe_db)):
    if favorites and user is None:
        raise auth_error()
    items, total = service.list_recipes(db, q=q, quick=quick, limit=limit, offset=offset,
                                       user_id=user.id if user else None, favorites=favorites)
    return {'items': items, 'total': total, 'limit': limit, 'offset': offset,
            'meta': recipe_meta('mixed' if user else 'demo')}


@router.get('/{recipe_id}', response_model=Detail[RecipeRead])
def get_recipe(recipe_id: str, user: CurrentUser | None = Depends(optional_user), db: Session = Depends(recipe_db)):
    item = service.get_recipe(db, recipe_id, user.id if user else None)
    if item is None:
        fail(404, 'RECIPE_NOT_FOUND', 'Recette introuvable.')
    return {'item': item, 'meta': recipe_meta('user_content' if item.is_owned else 'demo')}


@router.post('', response_model=Detail[RecipeRead], status_code=201)
def create_recipe(body: RecipeWrite, user: CurrentUser = Depends(current_user), db: Session = Depends(recipe_db)):
    return {'item': service.create_recipe(db, body, user), 'meta': recipe_meta('user_content')}


@router.put('/{recipe_id}', response_model=Detail[RecipeRead])
def update_recipe(recipe_id: str, body: RecipeWrite, user: CurrentUser = Depends(current_user), db: Session = Depends(recipe_db)):
    return {'item': service.update_recipe(db, recipe_id, body, user), 'meta': recipe_meta('user_content')}


@router.delete('/{recipe_id}', status_code=204)
def delete_recipe(recipe_id: str, user: CurrentUser = Depends(current_user), db: Session = Depends(recipe_db)):
    service.delete_recipe(db, recipe_id, user)
    return Response(status_code=204)


@router.put('/{recipe_id}/favorite', status_code=204)
def add_favorite(recipe_id: str, user: CurrentUser = Depends(current_user), db: Session = Depends(recipe_db)):
    service.set_favorite(db, recipe_id, user, True)
    return Response(status_code=204)


@router.delete('/{recipe_id}/favorite', status_code=204)
def remove_favorite(recipe_id: str, user: CurrentUser = Depends(current_user), db: Session = Depends(recipe_db)):
    service.set_favorite(db, recipe_id, user, False)
    return Response(status_code=204)
