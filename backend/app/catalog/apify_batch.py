"""Un quota et un budget réservés à chaque ingrédient ; archives reprises sans doublon."""
import copy
from decimal import Decimal, ROUND_DOWN

from .apify_ingestion import capture, normalize_archive, save_archive, validate_archive
from .schemas import Coverage

VERSION = 'apify-batch-1.0'


def plan_batch(base: dict, queries: dict, categories: list[str] | None = None) -> dict:
    entries = categories if categories is not None else [i['id'] for i in base['ingredients']]
    count = len(entries)
    if count == 0 or len(set(entries)) != count:
        raise ValueError('Liste de recherches vide ou dupliquée.')
    if base['max_items'] < count:
        raise ValueError('--max-items doit réserver au moins un résultat par ingrédient.')
    charge = (Decimal(str(base['max_charge_usd'])) / count).quantize(Decimal('0.000001'), rounding=ROUND_DOWN)
    if charge <= 0:
        raise ValueError('Budget trop petit pour être réparti entre les ingrédients.')
    jobs = []
    for index, key in enumerate(entries):
        job = copy.deepcopy(base)
        job['rows'], job['capture_complete'] = [], False
        for metadata_key in ('run_id', 'dataset_id', 'run_status', 'start_requested', 'capture_error'):
            job.pop(metadata_key, None)
        if categories is not None:
            job['input'].pop('search_terms', None)
            job['input']['categories'] = [key]
            job['food_categories'] = categories
        else:
            job['input']['search_terms'] = [queries[key]]
        job['max_items'] = base['max_items'] // count + (index < base['max_items'] % count)
        job['max_charge_usd'] = float(charge)
        job['ingredient_id'] = key  # Clé historique de recherche ; rayon en mode food_categories.
        jobs.append(job)
    return {'schema_version': VERSION, 'mode': 'food_categories' if categories is not None else 'ingredients',
            'food_categories': categories, 'max_items': base['max_items'],
            'max_charge_usd': base['max_charge_usd'], 'jobs': jobs}


def validate_batch(batch):
    if batch.get('schema_version') != VERSION or not isinstance(batch.get('jobs'), list) or not batch['jobs']:
        raise ValueError('Plan Apify invalide.')
    seen = set()
    if type(batch['max_items']) is not int or not 1 <= batch['max_items'] <= 10000:
        raise ValueError('Quota global invalide.')
    budget = Decimal(str(batch['max_charge_usd']))
    if not budget.is_finite() or not 0 < budget <= 10:
        raise ValueError('Budget global invalide.')
    reference = batch['jobs'][0]
    food = batch.get('mode') == 'food_categories'
    for job in batch['jobs']:
        validate_archive(job)
        query = job['input'].get('categories' if food else 'search_terms', [])
        if job['ingredient_id'] in seen or len(query) != 1:
            raise ValueError('Requête dupliquée ou ambiguë dans le plan.')
        if food and (query != [job['ingredient_id']] or job['input'].get('search_terms')
                     or job['input'].get('on_sale_only') is not True):
            raise ValueError('Requête promotions alimentaires incohérente.')
        seen.add(job['ingredient_id'])
        if job['ingredients'] != reference['ingredients'] or job['target_store'] != reference['target_store']:
            raise ValueError('Référentiels incohérents dans le plan.')
    expected = set(batch['food_categories']) if food else {i['id'] for i in reference['ingredients']}
    if seen != expected:
        raise ValueError('Le plan doit réserver une recherche à chaque ingrédient.')
    if sum(j['max_items'] for j in batch['jobs']) > batch['max_items']:
        raise ValueError('Quota global dépassé dans le plan.')
    if sum(Decimal(str(j['max_charge_usd'])) for j in batch['jobs']) > Decimal(str(batch['max_charge_usd'])):
        raise ValueError('Budget global dépassé dans le plan.')


async def capture_batch(client, batch, path):
    validate_batch(batch)
    save = lambda: save_archive(path, batch)
    save()
    for job in batch['jobs']:
        if job['capture_complete']:
            continue
        if job.get('start_requested') and not job.get('run_id'):
            raise ValueError('POST de statut incertain : vérifier la console Apify avant de relancer ce lot.')
        await capture(client, job, path, resume=bool(job.get('run_id')), persist=save)


def normalize_batch(batch):
    validate_batch(batch)
    catalogs = [normalize_archive(job) for job in batch['jobs']]
    result = catalogs[0].model_copy(deep=True)
    products, offers, matches = {}, {}, {}
    errors, truncations, searches = [], [], []
    for job, catalog in zip(batch['jobs'], catalogs):
        products.update({p.id: p for p in catalog.products})
        offers.update({o.id: o for o in catalog.offers})
        matches.update({(m.ingredient_id, m.product_id): m for m in catalog.matches})
        for offer in catalog.offers:
            offer.capture_id = job['ingredient_id'] + '/' + offer.capture_id
        errors.extend({'ingredient_id': job['ingredient_id'], **e} for e in catalog.collection['errors'])
        truncations.extend(job['ingredient_id'] + ':' + t for t in catalog.collection['truncations'])
        searches.append({'ingredient_id': job['ingredient_id'], 'query': (job['input'].get('categories') or job['input']['search_terms'])[0],
                         'row_count': len(job['rows']), 'limit': job['max_items'],
                         'complete': job['capture_complete'], 'run_id': job.get('run_id')})
    result.products, result.offers, result.matches = list(products.values()), list(offers.values()), list(matches.values())
    result.evaluated_at = max(c.evaluated_at for c in catalogs)
    result.coverage = []
    for ingredient in result.ingredients:
        ids = {m.product_id for m in result.matches if m.ingredient_id == ingredient.id and m.status == 'suggested'}
        count = sum(o.product_id in ids for o in result.offers)
        result.coverage.append(Coverage(ingredient_id=ingredient.id, candidate_count=len(ids),
                                       offer_count=count, status='review_required' if count else 'no_reference_found'))
    result.collection = {'source': 'apify_loblaws', 'strategy': 'food_categories' if batch.get('mode') == 'food_categories' else 'per_ingredient',
                         'on_sale_only': all(j['input'].get('on_sale_only') is True for j in batch['jobs']),
                         'capture_count': sum(len(j['rows']) for j in batch['jobs']),
                         'errors': errors, 'truncations': truncations, 'searches': searches,
                         'rejected_search_rows': [], 'complete_catalog': False}
    return result
