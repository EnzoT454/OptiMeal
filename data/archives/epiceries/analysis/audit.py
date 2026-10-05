"""Audit saved API responses offline; flag inconsistencies, not real-world truth."""
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / 'responses'
D = lambda value: Decimal(str(value))
FACTORS = {'g': ('mass', D(1)), 'kg': ('mass', D(1000)),
           'lb': ('mass', D('453.59237')), 'ml': ('volume', D(1)), 'l': ('volume', D(1000))}


def size_value(text):
    if not isinstance(text, str):
        return None
    match = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|ml|l)\s*', text.lower())
    if not match:
        return None
    dimension, factor = FACTORS[match[2]]
    quantity = D(match[1].replace(',', '.')) * factor
    return (dimension, quantity) if quantity > 0 else None


def price_issues(row):
    issues = []
    size = size_value(row.get('size'))
    unit = row.get('unitPrice')
    if size is None:
        issues.append('format_unparsed_or_missing')
    if not unit or unit.get('value') is None:
        issues.append('unit_price_missing')
        return issues
    basis = size_value(unit.get('unit'))
    if not basis:
        return issues
    if size:
        if size[0] != basis[0]:
            issues.append('mass_volume_mismatch')
        elif row.get('price') is not None:
            expected = D(row['price']) / size[1] * basis[1]
            # Exploratory tolerance for rounding to two decimal places.
            if abs(expected - D(unit['value'])) > D('0.0051'):
                issues.append('unit_price_arithmetic_mismatch')
    raw = re.fullmatch(r'(\d+(?:[.,]\d+)?)\s*/\s*(.*)', unit.get('raw') or '')
    if raw:
        raw_basis = size_value(raw[2])
        if raw_basis and raw_basis == basis and abs(D(raw[1].replace(',', '.')) - D(unit['value'])) > D('0.0051'):
            issues.append('unit_price_raw_value_conflict')
    return issues


def main():
    findings = []
    calls = []
    for path in sorted(OUT.glob('*.json')):
        if path.name.startswith('run'):
            continue
        saved = json.loads(path.read_text())
        body = saved['body']; data = body.get('data', {})
        calls.append({'file':path.name, 'http':saved['status'], 'ok':body.get('ok')})
        if saved['status'] >= 400:
            assert saved['status'] == 400 and body['error']['code'] == 'bad_request'
            continue
        assert saved['status'] == 200 and body['ok'] is True
        rows = data.get('results', [])
        if 'results' in data:
            assert data['count'] == len(rows) and len(rows) <= data['limit']
        if 'product' in data:
            rows = rows + [data['product']]
        elif 'id' in data and 'name' in data:
            rows = rows + [data]
        for row in rows:
            issues = price_issues(row)
            if row.get('category') == 7 and size_value(row.get('size')) and size_value(row['size'])[0] == 'mass':
                issues.append('milk_category_with_mass_needs_review')
            if issues:
                findings.append({'file':path.name,'id':row['id'],'name':row['name'],'issues':issues})
            for price in row.get('prices', []):
                when = datetime.fromisoformat(price['date'])
                assert int(when.timestamp()) == price['timestamp']
                age = (datetime.fromisoformat(saved['requested_at'])-when).total_seconds()/86400
                if age > 7:
                    findings.append({'file':path.name,'id':row['id'],'store':price['store'],'issues':['older_than_7_days_proposed_threshold'],'age_days':round(age,1)})
                if price['store'] == row['store'] and D(price['price']) != D(row['price']):
                    findings.append({'file':path.name,'id':row['id'],'issues':['summary_vs_store_price_conflict'],'summary_price':row['price'],'store_price':price['price'],'summary_updated':row['updated'],'store_date':price['date']})
        history = data.get('history', [])
        timestamps = [x['timestamp'] for x in history]
        assert timestamps == sorted(timestamps)
        keys = [(x['store'],x['timestamp'],str(x['price']),x.get('size')) for x in history]
        if len(keys) != len(set(keys)):
            findings.append({'file':path.name,'issues':['duplicate_history_rows'],'duplicates':len(keys)-len(set(keys))})
    first = json.loads((OUT/'search-milk.json').read_text())['body']['data']['results']
    second = json.loads((OUT/'search-page2.json').read_text())['body']['data']['results']
    assert not ({r['id'] for r in first} & {r['id'] for r in second})
    report = {'calls_saved':len(calls),'http_successes':sum(c['http']==200 for c in calls),
              'expected_http_400':sum(c['http']==400 for c in calls),
              'scope':'Small convenience sample; no claim of population accuracy or verified retailer prices.',
              'findings':findings}
    (ROOT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='findings'},ensure_ascii=False))
    print(len(findings),'quality flags; see audit.json')


if __name__ == '__main__':
    main()
