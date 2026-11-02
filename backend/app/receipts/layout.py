"""Rattachement des prix lus dans une colonne aux lignes imprimées.

Les montants viennent exclusivement des blocs OCR. Le rapprochement exige
le même nombre de lignes tarifées et de prix, un ordre identique et une
proximité verticale ; il ne dépend pas du total attendu.
"""
import re
from statistics import median

from .parser import group_blocks, prepare_tesseract_lines
from .rules import generic, maxi, superc
from .rules.common import AMOUNT, TOTAL, normalized, trailing_amount
from .schemas import OCRBlock

PRICE = re.compile(rf'^[-−]?\s*\$?\s*{AMOUNT}\s*\$?$')


def price_column_bounds(blocks: list[OCRBlock], include_totals: bool = True) -> tuple[float, float] | None:
    prices = [b for b in blocks if PRICE.fullmatch(b.text.strip()) and b.x > .5]
    if len(prices) < 3:
        return None
    # Une colonne de montants justifiés à droite, distincte des prix unitaires.
    clusters = [[b for b in prices if abs(b.x + b.width - (p.x + p.width)) < .035]
                for p in prices]
    column = max(clusters, key=lambda group: (len(group), median(b.x for b in group)))
    if len(column) < 3:
        return None
    # Les totaux sont imprimés dans une police beaucoup plus large. Même si
    # leur OCR est illisible, ne pas couper leurs premiers chiffres.
    left = max(.5, min(min(b.x for b in column) - .025,
                       median(b.x + b.width for b in column) - 3.25 * median(b.width for b in column)))
    if not include_totals:
        left = max(.5, median(b.x for b in column) - .02)
    right = min(1, max(b.x + b.width for b in column) + .02)
    return left, right


def align_price_column(blocks: list[OCRBlock], profile: str) -> list[str] | None:
    if profile not in ('maxi', 'superc'):
        return None
    bounds = price_column_bounds(blocks)
    if bounds is None:
        return None
    left, _ = bounds
    narrow, _ = price_column_bounds(blocks, include_totals=False)
    prices = sorted([b for b in blocks if b.x >= left and b.x + b.width > bounds[1] - .08
                     and PRICE.fullmatch(b.text.strip())],
                    key=lambda b: b.y + b.height / 2)
    labels = [b for b in blocks if b.x < narrow and b not in prices]
    rows = group_blocks(labels)
    texts = [' '.join(b.text.strip() for b in row) for row in rows]
    texts, _ = prepare_tesseract_lines(texts)
    if profile == 'superc':
        texts, _ = superc.prepare_lines(texts)
    positions = [median(b.y + b.height / 2 for b in row) for row in rows]
    heights = [median(b.height for b in row) for row in rows]
    rules = maxi if profile == 'maxi' else superc
    start = next((i for i, text in enumerate(texts) if rules.category(text)), None)
    subtotal = next((i for i, text in enumerate(texts)
                     if start is not None and i > start and TOTAL.match(normalized(text))), None)
    if start is None or subtotal is None:
        return None
    end = next((i for i in range(subtotal, len(texts))
                if re.match(r'^TOTAL(?:\s|[.:]|$)', normalized(texts[i]))
                and not normalized(texts[i]).startswith('TOTAL ARRONDI')), None)
    if end is None:
        return None
    anchors = []
    def detail_label(text):
        return (generic.detail(text)[0] or superc.detail(text)[0]
                or generic.detail_candidate(text)
                or re.match(r'^\s*(?:\d+(?:[.,]\d+)?|[bBiIzZà])\s*(?:kg(?:\s+Net)?)?\s*[08O©@]\s*\$\d', text))
    for i in range(start + 1, end + 1):
        text = texts[i]
        value = normalized(text)
        following = texts[i + 1] if i + 1 < len(texts) else ''
        if rules.category(text) or superc.weight_line(text):
            continue
        if i >= subtotal:
            # Les taxes et totaux ont aussi leur montant dans cette colonne.
            if TOTAL.match(value) or '%' in value or re.search(r'T\.?\s*P\.?\s*S|T\.?\s*V\.?\s*Q', value):
                anchors.append(i)
            continue
        if profile == 'superc' and re.match(r'^(RABAIS|RABALS|REBAIS)\b', value):
            continue
        is_detail = detail_label(text)
        if is_detail:
            anchors.append(i)
            continue
        if profile == 'maxi':
            if not maxi.PRODUCT.match(text) and not re.match(r'^[A-Za-zÀ-ÿ].{3,}', text):
                continue
        elif not (re.match(r'^(?:\(\d+\))?\s*[A-Za-zÀ-ÿ]', text)):
            continue
        # Une ligne quantité/prix porte le montant du produit précédent.
        if detail_label(following) or superc.weight_line(following):
            continue
        if trailing_amount(text)[1] is None:
            anchors.append(i)
    if not anchors:
        return None
    margin = median(heights[start:end + 1]) * 1.25
    end_boundary = positions[end] + margin
    if end + 1 < len(positions):
        end_boundary = min(end_boundary, (positions[end] + positions[end + 1]) / 2)
    candidates = [b for b in prices
                  if positions[start] - margin < b.y + b.height / 2 < end_boundary]
    if len(candidates) != len(anchors):
        return None
    for index, price in zip(anchors, candidates):
        if abs(positions[index] - (price.y + price.height / 2)) > 2 * max(heights[index], price.height):
            return None
    result = texts[:]
    for index, price in zip(anchors, candidates):
        if TOTAL.match(normalized(result[index])):
            result[index] = TOTAL.match(normalized(result[index]))[1]
        elif detail_label(result[index]):
            # La coupe entre colonnes peut laisser un fragment après le prix
            # unitaire. Garder le détail explicite complet et le prix relu.
            prefix = re.match(rf'^\s*(?:\d+(?:[.,]\d+)?|[bBiIzZà])\s*(?:kg(?:\s+Net)?|lb)?\s*'
                              rf'[@©08OàeEG]\s*\$?\s*{AMOUNT}(?:\s*/\s*(?:kg|lb))?', result[index])
            if prefix and '/' not in result[index][prefix.end():]:
                result[index] = prefix[0]
        result[index] += ' ' + price.text.strip()
    return result
