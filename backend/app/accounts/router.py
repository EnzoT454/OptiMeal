"""Identité Supabase et profil métier de l’utilisateur authentifié."""
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.security import CurrentUser, current_user
from .models import Profile
from .schemas import AccountDelete, Identity, ProfilePatch, ProfileRead
from .service import ensure_profile, read_profile

router = APIRouter(tags=['Comptes'])


@router.get('/auth/me', response_model=Identity)
def identity(user: CurrentUser = Depends(current_user)):
    return Identity(id=user.id, email=user.email)


@router.get('/api/v1/me', response_model=ProfileRead)
def get_profile(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    ensure_profile(db, user)
    result = read_profile(db, user)
    db.commit()
    return result


@router.patch('/api/v1/me', response_model=ProfileRead)
def update_profile(body: ProfilePatch, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    ensure_profile(db, user)
    db.execute(update(Profile).where(Profile.id == user.id).values(**body.model_dump()))
    result = read_profile(db, user)
    db.commit()
    return result


@router.delete('/api/v1/me', status_code=204,
               responses={401: {'description': 'Connexion requise'},
                          503: {'description': 'Suppression indisponible ou interrompue'}})
def delete_account(body: AccountDelete, request: Request, user: CurrentUser = Depends(current_user)):
    request.app.state.account_deletion.delete(user.id)
    return Response(status_code=204)
