"""Routes du calendrier ; toutes demandent d'être connecté."""
import datetime as dt
from collections.abc import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.app.common.contracts import Detail, ErrorResponse, ResponseMeta
from backend.app.common.public_router import fail
from backend.app.database import get_db
from backend.app.security import CurrentUser, current_user
from . import service
from .schemas import MealPlanEntryRead, MealPlanEntryUpdate, MealPlanEntryWrite, MealPlanRead

router = APIRouter(prefix='/api/v1/plans', tags=['Calendrier v1'], responses={
    401: {'model': ErrorResponse}, 404: {'model': ErrorResponse},
    422: {'model': ErrorResponse, 'description': 'Unprocessable Entity'}, 503: {'model': ErrorResponse},
})


def planning_db(request: Request) -> Iterator[Session]:
    try:
        yield from get_db(request)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        fail(503, 'PLANNING_UNAVAILABLE', 'Le calendrier est indisponible. Vérifier la connexion et les migrations.')
    except ValidationError:
        fail(503, 'PLANNING_UNAVAILABLE', 'Les données du calendrier sont invalides.')


def plan_meta() -> ResponseMeta:
    return ResponseMeta(data_source='postgresql', dataset_kind='user_content', review_required=False, warnings=[])


@router.get('', response_model=Detail[MealPlanRead])
def get_plan(week: dt.date | None = None, user: CurrentUser = Depends(current_user),
             db: Session = Depends(planning_db)):
    # week = n'importe quel jour de la semaine voulue ; l'app envoie le lundi.
    return {'item': service.get_plan(db, user, week or dt.date.today()), 'meta': plan_meta()}


@router.post('/entries', response_model=Detail[MealPlanEntryRead], status_code=201)
def add_entry(body: MealPlanEntryWrite, user: CurrentUser = Depends(current_user),
              db: Session = Depends(planning_db)):
    return {'item': service.add_entry(db, body, user), 'meta': plan_meta()}


@router.patch('/entries/{entry_id}', response_model=Detail[MealPlanEntryRead])
def update_entry(entry_id: UUID, body: MealPlanEntryUpdate, user: CurrentUser = Depends(current_user),
                 db: Session = Depends(planning_db)):
    return {'item': service.update_entry(db, entry_id, body, user), 'meta': plan_meta()}


@router.delete('/entries/{entry_id}', status_code=204)
def remove_entry(entry_id: UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(planning_db)):
    service.remove_entry(db, entry_id, user)
    return Response(status_code=204)