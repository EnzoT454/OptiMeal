"""Produits suivis : chaque utilisateur ne lit et ne modifie que ses propres suivis."""
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.app.accounts.service import ensure_profile
from backend.app.security import CurrentUser
from .models import ProductFollow
from .schemas import FollowListRead, FollowRead, FollowWrite

COLUMNS = (ProductFollow.product_id, ProductFollow.retailer, ProductFollow.name, ProductFollow.since)


def to_read(row) -> FollowRead:
    return FollowRead(product_id=row.product_id, retailer=row.retailer, name=row.name, since=row.since)


def list_follows(db: Session, user: CurrentUser) -> FollowListRead:
    rows = db.execute(select(*COLUMNS).where(ProductFollow.user_id == user.id)
                      .order_by(ProductFollow.since, ProductFollow.product_id)).all()
    return FollowListRead(items=[to_read(row) for row in rows])


def follow(db: Session, body: FollowWrite, user: CurrentUser) -> FollowRead:
    """Suivre un produit. Déjà suivi -> on garde la date d'origine et on met le nom à jour."""
    ensure_profile(db, user)
    values = body.model_dump(exclude_none=True)
    statement = (insert(ProductFollow).values(user_id=user.id, **values)
                 .on_conflict_do_update(index_elements=[ProductFollow.user_id, ProductFollow.product_id],
                                        set_={'name': body.name, 'retailer': body.retailer})
                 .returning(*COLUMNS))
    result = to_read(db.execute(statement).one())
    db.commit()
    return result


def unfollow(db: Session, product_id: str, user: CurrentUser) -> None:
    """Ne plus suivre. Rien à retirer -> pas d'erreur (l'app peut réessayer sans risque)."""
    # « AND user_id = moi » : impossible de retirer le suivi de quelqu'un d'autre.
    db.execute(delete(ProductFollow)
               .where(ProductFollow.user_id == user.id, ProductFollow.product_id == product_id))
    db.commit()