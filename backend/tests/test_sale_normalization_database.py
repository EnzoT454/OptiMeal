"""Même normalisation JSON/PostgreSQL, sans mutation ni relecture par produit."""
from datetime import date

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from backend.app.catalog.common_schemas import CommonCatalog
from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.catalog.models import ProductOffer
from backend.app.catalog.offer_import import read_offers, upsert_offers
from backend.app.catalog.sales import SaleReview, normalize_catalog, normalize_database, source_fingerprint
from backend.app.common.public_data import DEFAULT_CATALOG, source_product_from_database
from backend.tests.test_ingredient_import import postgres  # noqa: F401

DAY = date(2026, 11, 14)


def test_database_matches_json_preserves_raw_values_and_uses_one_query(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    categories, offers = read_offers(DEFAULT_CATALOG)
    upsert_offers(postgres, categories, offers)
    catalog = CommonCatalog.model_validate_json(DEFAULT_CATALOG.read_text())
    calls = []
    def count(*args):
        calls.append(args[2])
    with Session(bind=postgres, join_transaction_mode='create_savepoint') as db:
        event.listen(postgres, 'before_cursor_execute', count)
        try:
            actual = normalize_database(db, DAY)
        finally:
            event.remove(postgres, 'before_cursor_execute', count)
        assert sum('FROM product_offer' in query for query in calls) == 1
        assert not any(query.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')) for query in calls)
        expected = normalize_catalog(catalog, DAY)
        assert actual.items == expected.items and actual.issue_counts == expected.issue_counts
        assert actual.eligible_count == 0 and actual.product_count == 93
        assert db.in_transaction()  # le lecteur ne commit/rollback pas la transaction appelante


def test_review_for_same_snapshot_is_honored_by_json_and_database(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    categories, offers = read_offers(DEFAULT_CATALOG)
    upsert_offers(postgres, categories, offers)
    catalog = CommonCatalog.model_validate_json(DEFAULT_CATALOG.read_text())
    ingredient = next(i for i in catalog.ingredients if any(p.quantity == '1000' and p.unit == 'g' for p in i.products))
    product = next(p for p in ingredient.products if p.quantity == '1000' and p.unit == 'g')
    proof = SaleReview(product_id=product.id, ingredient_id=ingredient.id,
        source_fingerprint=source_fingerprint(ingredient.id, product), checked_at='2026-11-14T12:00:00Z',
        method='manual_review', reference='Test local fictif : aucune attestation du catalogue réel.',
        format_raw='1 kg', price_basis='package', price_basis_raw='Prix par paquet vérifié dans ce test uniquement.',
        match_status='verified', scope='store', conditions='unconditional')
    with Session(bind=postgres, join_transaction_mode='create_savepoint') as db:
        stored = db.scalar(select(ProductOffer).where(ProductOffer.id == product.id))
        assert source_product_from_database(stored) == product
        actual = normalize_database(db, DAY, [proof])
        expected = normalize_catalog(catalog, DAY, [proof])
        assert actual.items == expected.items and actual.eligible_count == expected.eligible_count == 1
