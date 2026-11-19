"""Routes des produits suivis ; toutes demandent d'être connecté."""
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.app.common.contracts import Detail, ErrorResponse, ResponseMeta
from backend.app.common.public_router import fail
from backend.app.database import get_db
from backend.app.security import CurrentUser, current_user
from . import service
from .schemas import FollowListRead, FollowRead, FollowWrite

router = APIRouter(prefix='/api/v1/follows', tags=['Produits suivis v1'], responses={
    401: {'model': ErrorResponse},
    422: {'model': ErrorResponse, 'description': 'Unprocessable Entity'}, 503: {'model': ErrorResponse},
})


def follows_db(request: Request) -> Iterator[Session]:
    try:
        yield from get_db(request)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        fail(503, 'FOLLOWS_UNAVAILABLE', 'Les produits suivis sont indisponibles. Vérifier la connexion et les migrations.')
    except ValidationError:
        fail(503, 'FOLLOWS_UNAVAILABLE', 'Les données des produits suivis sont invalides.')


def follow_meta() -> ResponseMeta:
    return ResponseMeta(data_source='postgresql', dataset_kind='user_content', review_required=False, warnings=[])


@router.get('', response_model=Detail[FollowListRead])
def list_follows(user: CurrentUser = Depends(current_user), db: Session = Depends(follows_db)):
    return {'item': service.list_follows(db, user), 'meta': follow_meta()}


@router.put('', response_model=Detail[FollowRead])
def follow(body: FollowWrite, user: CurrentUser = Depends(current_user), db: Session = Depends(follows_db)):
    # PUT : répéter le même appel ne crée jamais de doublon.
    return {'item': service.follow(db, body, user), 'meta': follow_meta()}


@router.delete('/{product_id:path}', status_code=204)
def unfollow(product_id: str = Path(min_length=1, max_length=200), user: CurrentUser = Depends(current_user),
             db: Session = Depends(follows_db)):
    service.unfollow(db, product_id, user)
    return Response(status_code=204)