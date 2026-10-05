"""Préparation et exécution de l'import Apify pour la commande catalogue commune."""
import copy
import json
import math
import os
from datetime import datetime, timezone

import httpx

from backend.app.price_sources.apify_loblaws import ACTOR, ApifyClient, resource_id
from .apify_batch import VERSION, plan_batch, validate_batch, capture_batch, normalize_batch
from .apify_ingestion import capture, normalize_archive, save_archive, validate_archive


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def configured_ingredients(config, ingredient_config, promos):
    folders = [config, config / 'batch2', config / 'batch3'] if promos else [ingredient_config]
    ingredients, queries = [], {}
    for folder in folders:
        ingredients.extend(read(folder / 'ingredients.json')['ingredients'])
        queries.update(read(folder / 'apify_queries.json')['queries'])
    return ingredients, queries


async def run_apify(args, config):
    ingredient_config = config / f'batch{args.batch}' if args.batch != '1' else config
    if args.refresh_rules and not args.replay:
        raise ValueError('--refresh-rules exige --replay.')
    if args.replay or args.resume:
        archive = copy.deepcopy(read(args.replay or args.resume))
        (validate_batch if archive.get('schema_version') == VERSION else validate_archive)(archive)
        if args.resume and archive.get('schema_version') != VERSION:
            resource_id(archive.get('run_id'))
    else:
        if args.promos and args.food_promos:
            raise ValueError('Choisir --food-promos ou --promos, pas les deux.')
        if (args.promos or args.food_promos) and args.max_items > 200:
            raise ValueError('--promos est limité à 200 résultats au total.')
        if not 1 <= args.max_items <= 10000 or not math.isfinite(args.max_charge_usd) or not 0 < args.max_charge_usd <= 10:
            raise ValueError('Limites Apify : 1–10000 résultats et budget > 0, au plus 10 USD.')
        target = read(config / 'target_store.json')
        ingredients, queries = configured_ingredients(config, ingredient_config, args.promos or args.food_promos)
        if set(queries) != {i['id'] for i in ingredients}:
            raise ValueError('Une requête Apify est requise pour chaque ingrédient.')
        if any(not isinstance(q, str) or not q.strip() for q in queries.values()):
            raise ValueError('Requête Apify vide ou invalide.')
        location = args.location_id or target.get('retailer_api_store_id')
        postal = args.postal_code
        if not location and not postal:
            raise ValueError('Préciser --location-id (identifiant vérifié) ou --postal-code (découverte).')
        actor_input = {'banner': 'maxi', 'search_terms': list(dict.fromkeys(queries.values())),
                       'group_variants': False, 'on_sale_only': args.promos or args.food_promos}
        if location:
            actor_input['locationId'] = resource_id(location)
        else:
            actor_input['postal_code'] = postal
        archive = {'schema_version': 'apify-capture-1.0', 'actor': ACTOR,
                   'dataset_kind': 'real', 'evaluated_at': datetime.now(timezone.utc).isoformat(),
                   'ingredients': ingredients, 'target_store': target, 'input': actor_input,
                   'max_items': args.max_items, 'max_charge_usd': args.max_charge_usd,
                   'rows': [], 'capture_complete': False}
        validate_archive(archive)
        categories = read(config / 'apify_food_categories.json')['categories'] if args.food_promos else None
        archive = plan_batch(archive, queries, categories=categories)
    if args.refresh_rules:
        jobs = archive['jobs'] if archive['schema_version'] == VERSION else [archive]
        promos = all(j['input'].get('on_sale_only') is True for j in jobs)
        ingredients, _ = configured_ingredients(config, ingredient_config, promos)
        for job in jobs:
            if {i['id'] for i in ingredients} != {i['id'] for i in job['ingredients']}:
                raise ValueError('Le rejeu avec nouvelles règles exige les mêmes identifiants ingrédients.')
            job.setdefault('previous_ingredient_rules', []).append(job['ingredients'])
            job['ingredients'] = copy.deepcopy(ingredients)
    # Aucun secret dans la capture. Vérification avant de créer un dossier ou lancer un run.
    token = os.getenv('APIFY_TOKEN', '')
    if not args.replay and not token.strip():
        raise ValueError('APIFY_TOKEN doit être défini dans l’environnement.')
    args.output_dir.mkdir(parents=True, exist_ok=False)
    path = args.output_dir / 'raw.json'
    if args.replay:
        save_archive(path, archive)
    else:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as http:
            if archive['schema_version'] == VERSION:
                await capture_batch(ApifyClient(http, token), archive, path)
            else:
                await capture(ApifyClient(http, token), archive, path, resume=bool(args.resume))
    return normalize_batch(archive) if archive['schema_version'] == VERSION else normalize_archive(archive)
