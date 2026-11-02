"""Moteurs OCR locaux. Aucun appel HTTP et aucun téléchargement de modèle."""
import csv
import io
import json
import platform
import re
import shutil
import subprocess
from pathlib import Path

from pydantic import TypeAdapter

from .schemas import OCRBlock

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TESSDATA_BEST_DIR = PROJECT_ROOT / '.cache' / 'receipt-tessdata-best'
TESSDATA_LEGACY_DIR = PROJECT_ROOT / '.cache' / 'receipt-tessdata-legacy'


def validate_blocks(value: object) -> list[OCRBlock]:
    return TypeAdapter(list[OCRBlock]).validate_python(value)


def tesseract_blocks(tsv: str) -> list[OCRBlock]:
    # Le texte TSV de Tesseract n'utilise pas l'échappement CSV : un guillemet
    # reconnu est un caractère, pas le début d'un champ multiligne.
    rows = list(csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE))
    page = next((row for row in rows if row['level'] == '1'), None)
    if page is None:
        raise ValueError('Tesseract n’a retourné aucune page TSV.')
    width, height = float(page['width']), float(page['height'])
    if width <= 0 or height <= 0:
        raise ValueError('Dimensions OCR invalides.')
    return [OCRBlock(
        text=row['text'], confidence=max(0, float(row['conf'])) / 100,
        x=float(row['left']) / width, y=float(row['top']) / height,
        width=float(row['width']) / width, height=float(row['height']) / height,
        line_key=':'.join(row[key] for key in ('page_num', 'block_num', 'par_num', 'line_num')),
    ) for row in rows if row['level'] == '5' and row['text'].strip()]


def crop_tesseract_item_area(image: Path, blocks: list[OCRBlock], output: Path) -> bool:
    """Recadre avant/après la zone d'articles sans altérer l'image d'origine."""
    category = re.compile(r'^(?:\d{1,2}\s*[-–]|EPICERIE|MICHE|PRODUIT|FRUITS|POISS)', re.I)
    total = re.compile(r'^(?:SOUS\W*TOTAL|SUBTOTAL|TOTAL)\b')
    first_category = next((block.y for block in blocks if category.match(block.text.strip())), None)
    if first_category is None:
        return False
    ending = [block.y + block.height for block in blocks
              if block.y >= first_category and total.match(block.text.strip().upper())]
    if not ending:
        return False
    try:
        import cv2
    except ImportError as exc:
        raise ValueError('Le recadrage Tesseract exige opencv-python-headless.') from exc
    import numpy as np
    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if pixels is None:
        raise ValueError('Image illisible pour le prétraitement Tesseract.')
    bottom = min(pixels.shape[0], round((max(ending) + .03) * pixels.shape[0]))
    if bottom <= pixels.shape[0] * .15:
        return False
    output.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode('.png', pixels[:bottom])
    if not ok:
        raise ValueError('Impossible d’écrire le recadrage temporaire Tesseract.')
    output.write_bytes(encoded.tobytes())
    return True


def prepare_tesseract_image(image: Path, output: Path) -> None:
    """Agrandit le texte et redresse une petite inclinaison mesurable."""
    import cv2
    import numpy as np

    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        raise ValueError('Image illisible pour le prétraitement Tesseract.')
    scale = min(3.0, max(1.0, 1400 / pixels.shape[1]))
    pixels = cv2.resize(pixels, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    edges = cv2.Canny(pixels, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80,
                            minLineLength=max(80, pixels.shape[1] // 5), maxLineGap=20)
    angles = []
    if lines is not None:
        for x1, y1, x2, y2 in lines.reshape(-1, 4):
            angle = float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            if abs(angle) <= 12:
                angles.append(angle)
    if len(angles) >= 3:
        angle = float(np.median(angles))
        if abs(angle) >= .3:
            height, width = pixels.shape
            rotation = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1)
            pixels = cv2.warpAffine(pixels, rotation, (width, height),
                                    flags=cv2.INTER_CUBIC, borderValue=255)
    pixels = cv2.copyMakeBorder(pixels, 15, 15, 15, 15, cv2.BORDER_CONSTANT, value=255)
    ok, encoded = cv2.imencode('.png', pixels)
    if not ok:
        raise ValueError('Impossible d’encoder le prétraitement Tesseract.')
    output.write_bytes(encoded.tobytes())


def crop_tesseract_columns(image: Path, blocks: list[OCRBlock], output: Path) -> bool:
    """Retire les bords parasites autour des colonnes Maxi reconnues.

    Les bornes viennent de plusieurs codes et prix lus, jamais du montant
    attendu. Garder la hauteur complète conserve l'en-tête et la date.
    """
    grouped: dict[str, list[OCRBlock]] = {}
    for block in blocks:
        if block.line_key:
            grouped.setdefault(block.line_key, []).append(block)
    codes, prices = [], []
    for row in grouped.values():
        row_codes = [b for b in row if re.fullmatch(r'(?:\(\d+\)\s*)?\d{4,14}', b.text)]
        if not row_codes or not any(b.text == 'MRJ' for b in row):
            continue
        codes.extend(row_codes)
        prices.extend(b for b in row if re.fullmatch(r'\d+[.,]\d{2}', b.text)
                      and b.x > max(c.x + c.width for c in row_codes))
    if len(codes) < 3 or len(prices) < 3:
        return False
    left = max(0, min(b.x for b in codes) - .04)
    right = min(1, max(b.x + b.width for b in prices) + .04)
    # Une colonne trop étroite n'est pas une zone d'articles fiable.
    if right - left < .6 or (left == 0 and right == 1):
        return False
    import cv2
    import numpy as np

    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        raise ValueError('Image illisible pour le recadrage des colonnes Tesseract.')
    cropped = pixels[:, round(left * pixels.shape[1]):round(right * pixels.shape[1])]
    ok, encoded = cv2.imencode('.png', cropped)
    if not ok:
        raise ValueError('Impossible d’encoder les colonnes Tesseract.')
    output.write_bytes(encoded.tobytes())
    return True


def reread_member_discount(image: Path, blocks: list[OCRBlock], model_dir: Path,
                           temporary: Path) -> tuple[list[OCRBlock], bool]:
    """Relit le montant signé d'un rabais membre, depuis ses pixels uniquement."""
    if not (model_dir / 'eng.traineddata').is_file():
        return blocks, False
    import cv2
    import numpy as np

    grouped: dict[str, list[int]] = {}
    for index, block in enumerate(blocks):
        if block.line_key:
            grouped.setdefault(block.line_key, []).append(index)
    result = [block.model_copy() for block in blocks]
    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        return blocks, False
    height, width = pixels.shape
    changed = False
    for indices in grouped.values():
        text = ' '.join(blocks[i].text for i in indices).upper()
        if 'RABAIS MEMBRE' not in text:
            continue
        for index in indices:
            block = blocks[index]
            if not re.fullmatch(r'[-−]\d+[.,]\d{2}', block.text):
                continue
            left, right = max(0, int((block.x - .01) * width)), min(width, int((block.x + block.width + .01) * width))
            top, bottom = max(0, int((block.y - .004) * height)), min(height, int((block.y + block.height + .004) * height))
            crop = pixels[top:bottom, left:right]
            if not crop.size:
                continue
            crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
            crop = cv2.copyMakeBorder(crop, 10, 10, 10, 10, cv2.BORDER_CONSTANT, value=255)
            path = temporary / f'discount-{index}.png'
            ok, encoded = cv2.imencode('.png', crop)
            if not ok:
                continue
            path.write_bytes(encoded.tobytes())
            command = ['tesseract', str(path.resolve()), 'stdout', '--tessdata-dir', str(model_dir.resolve()),
                       '-l', 'eng', '--psm', '7', '--oem', '1', '-c', 'tessedit_char_whitelist=0123456789.-']
            try:
                response = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
            except (OSError, subprocess.TimeoutExpired):
                # Une relecture facultative ne doit pas faire échouer l'OCR principal.
                continue
            value = response.stdout.strip()
            if response.returncode == 0 and re.fullmatch(r'-\d+\.\d{2}', value) and value != block.text:
                result[index].text = value
                changed = True
    return result, changed


def recognize(image: Path, engine: str, languages: str = 'fra+eng',
              tesseract_psm: int = 4, tessdata_dir: Path | None = None,
              tesseract_oem: int = 1) -> tuple[list[OCRBlock], str]:
    if engine == 'auto':
        engine = 'vision' if platform.system() == 'Darwin' else 'tesseract'
    if engine in ('vision', 'vision-fast'):
        if platform.system() != 'Darwin' or not shutil.which('swift'):
            raise ValueError('Vision nécessite macOS et Swift (outils de développement Apple).')
        cache = PROJECT_ROOT / '.cache' / 'swift-receipts'
        cache.mkdir(parents=True, exist_ok=True)
        command = ['swift', '-module-cache-path', str(cache),
                   str(Path(__file__).with_name('vision_ocr.swift')), str(image.resolve())]
        if engine == 'vision-fast':
            command.append('--fast')
    else:
        if not shutil.which('tesseract'):
            raise ValueError('Installer Tesseract et ses langues fra/eng, ou utiliser Vision sur macOS.')
        if tesseract_psm not in (3, 4, 6, 11, 12):
            raise ValueError('PSM Tesseract pris en charge : 3, 4, 6, 11 ou 12.')
        # Les reçus sont habituellement une longue colonne aux tailles de texte variées.
        command = ['tesseract', str(image.resolve()), 'stdout', '-l', languages,
                   '--psm', str(tesseract_psm), '-c', 'tessedit_create_tsv=1']
        if tessdata_dir is not None:
            command.extend(['--tessdata-dir', str(tessdata_dir.resolve()), '--oem', str(tesseract_oem)])
    result = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
    if result.returncode:
        raise ValueError(f'Échec OCR {engine} : {result.stderr.strip()}')
    blocks = (validate_blocks(json.loads(result.stdout)) if engine.startswith('vision')
              else tesseract_blocks(result.stdout))
    return blocks, engine


def printed_total_blocks(blocks: list[OCRBlock]) -> list[OCRBlock]:
    """Distingue TOTAL de SOUS-TOTAL, TOTAL ARRONDI et du bilan d'économies."""
    from .rules.common import normalized
    from .rules import superc
    result = []
    for block in blocks:
        if not re.match(r'^(?:TOTAL|TOT|[“”"]?OTAL)(?:\s|[.:]|$)', normalized(block.text)):
            continue
        siblings = [b for b in blocks if block.line_key is not None and b.line_key == block.line_key]
        context = normalized(' '.join(b.text for b in siblings) if siblings else block.text)
        context = superc.prepare_lines([context])[0][0]
        if not re.search(r'SOUS|ARRONDI|ECONOM', context):
            result.append(block)
    return result


def normalize_price_text(text: str) -> str | None:
    """Nettoie la ponctuation d'un champ monétaire isolé, sans changer les chiffres."""
    from .layout import PRICE
    text = re.sub(r'\s+', '', text).strip('_|*\"\u2018\u2019;:')
    text = re.sub(r'^[FP]{1,2}(?=\d)', '', text)
    text = re.sub(r"(?<=\d)['\u2019](?=[.,])", '', text)
    text = re.sub(r'^(\d+)[_–—-](\d{2})$', r'\1.\2', text)
    text = re.sub(r'^(\d+[.,]\d)[.,](\d)$', r'\1\2', text)
    return text if PRICE.fullmatch(text) else None


def reread_price_column(image: Path, blocks: list[OCRBlock], engine: str,
                        temporary: Path, variant: str,
                        use_best_model: bool = True,
                        use_legacy_model: bool = True) -> list[OCRBlock] | None:
    """Relit les pixels de la colonne des montants, sans utiliser le total attendu."""
    from .layout import PRICE, price_column_bounds
    from .parser import group_blocks
    from .rules.common import normalized
    import cv2
    import numpy as np

    bounds = price_column_bounds(blocks)
    if bounds is None:
        return None
    categories = [b for b in blocks if re.match(
        r'^(?:\d{1,2}\s*[-–]\s*)?(?:EPICERIE|FRUIT|VIANDE|PRODUIT|BOUL)', normalized(b.text))]
    if not categories:
        return None
    top = max(0, min(b.y for b in categories) - .005)
    totals = [b for b in printed_total_blocks(blocks) if b.y > top]
    if not totals:
        return None
    ending = min(totals, key=lambda b: b.y)
    bottom = min(1, ending.y + max(.025, ending.height * 2))
    left, right = bounds
    numeric_psm = 4 if variant.endswith('-psm4') else 6
    preprocessing = variant.split('-')[0]
    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        return None
    height, width = pixels.shape
    x0, x1 = int(left * width), min(width, round(right * width))
    y0, y1 = int(top * height), min(height, round(bottom * height))
    subtotals = [b for b in blocks if normalized(b.text).startswith('SOUS') and b.y > top]
    split_y = min((b.y for b in subtotals), default=ending.y) - .004
    narrow, _ = price_column_bounds(blocks, include_totals=False)
    replacement = []
    # Les prix d'articles et les gros totaux n'ont pas la même largeur.
    # Deux lectures évitent les fragments MRJ/FP à gauche des petits montants
    # et conservent tous les chiffres des gros montants.
    for region, region_left, region_top in (
            ('items', narrow, top), ('totals', left, max(top, split_y - .025))):
        x0, x1 = int(region_left * width), min(width, round(right * width))
        y0, y1 = int(region_top * height), min(height, round(bottom * height))
        crop = pixels[y0:y1, x0:x1]
        if crop.size == 0:
            continue
        scale = 1 if engine == 'vision' and region == 'totals' else 3
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        if preprocessing != 'gray':
            background = cv2.GaussianBlur(crop, (0, 0), 21)
            crop = cv2.divide(crop, background, scale=255)
        if preprocessing == 'binary':
            _, crop = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        crop = cv2.copyMakeBorder(crop, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        path = temporary / f'prices-{region}-{variant}.png'
        path.write_bytes(cv2.imencode('.png', crop)[1].tobytes())
        model_dir = TESSDATA_BEST_DIR
        best_model = use_best_model and engine == 'tesseract' and (model_dir / 'eng.traineddata').is_file()
        legacy_dir = TESSDATA_LEGACY_DIR
        legacy_model = use_legacy_model and engine == 'tesseract' and (legacy_dir / 'eng.traineddata').is_file()
        if legacy_model:
            model_dir, best_model = legacy_dir, False
        region_engine = 'vision-fast' if engine == 'vision' and region == 'totals' else engine
        recognized, _ = recognize(path, region_engine, languages='eng' if engine == 'tesseract' else 'fra+eng',
                                 tesseract_psm=numeric_psm, tessdata_dir=model_dir if best_model or legacy_model else None,
                                 tesseract_oem=0 if legacy_model else 1)
        for index, row in enumerate(group_blocks(recognized)):
            text = normalize_price_text(' '.join(b.text for b in row))
            if text is None:
                continue
            bx0, by0 = min(b.x for b in row) * crop.shape[1], min(b.y for b in row) * crop.shape[0]
            bx1 = max(b.x + b.width for b in row) * crop.shape[1]
            by1 = max(b.y + b.height for b in row) * crop.shape[0]
            center = (y0 + ((by0 + by1) / 2 - 20) / scale) / height
            if (region == 'items' and center >= split_y) or (region == 'totals' and center < split_y):
                continue
            replacement.append(OCRBlock(text=text, confidence=min(b.confidence for b in row),
                x=max(0, (x0 + (bx0 - 20) / scale) / width),
                y=max(0, (y0 + (by0 - 20) / scale) / height),
                width=(bx1 - bx0) / scale / width, height=(by1 - by0) / scale / height,
                line_key=f'price-column{"-legacy" if legacy_model else "-best" if best_model else ""}:{region}:{index}'))

    if not replacement:
        return None
    # Garder les libellés et les prix unitaires de la première lecture.
    narrow, _ = price_column_bounds(blocks, include_totals=False)
    kept = [b for b in blocks if not (top <= b.y + b.height / 2 <= bottom
            and (b.x >= narrow or (b.x >= left and not re.search(r'[A-Za-z]', b.text))))]
    return kept + replacement


def prepare_receipt_body(image: Path, blocks: list[OCRBlock], output: Path,
                         variant: str) -> bool:
    """Isole le texte du reçu avant paiements/publicités pour une seconde lecture."""
    from .layout import price_column_bounds
    from .rules.common import normalized
    import cv2
    import numpy as np

    anchors = [b for b in blocks if re.match(
        r'^(?:MAX[IT][&8@]?|SUPER|BIENVENUE|(?:\d{1,2}[-–])?EPICERIE|FRUIT|TOTAL)', normalized(b.text))]
    totals = printed_total_blocks(blocks)
    bounds = price_column_bounds(blocks)
    if not anchors or not totals or bounds is None:
        return False
    end = min(totals, key=lambda b: b.y)
    above = [b for b in anchors if b.y < end.y]
    if not above:
        return False
    left = max(0, min(b.x for b in above) - .025)
    right = bounds[1]
    top = max(0, min(b.y for b in above) - .04)
    bottom = min(1, end.y + max(.025, end.height * 4))
    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        return False
    height, width = pixels.shape
    crop = pixels[int(top * height):round(bottom * height), int(left * width):round(right * width)]
    if not crop.size or crop.shape[1] < 40:
        return False
    scale = min(3, max(1, 1600 / crop.shape[1]))
    crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if variant != 'gray':
        background = cv2.GaussianBlur(crop, (0, 0), 15)
        crop = cv2.divide(crop, background, scale=255)
    if variant == 'binary':
        _, crop = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    crop = cv2.copyMakeBorder(crop, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    output.write_bytes(cv2.imencode('.png', crop)[1].tobytes())
    return True


def reread_text_column(image: Path, blocks: list[OCRBlock], engine: str,
                       temporary: Path) -> list[OCRBlock] | None:
    """Relit les descriptions sans l'espace séparant la colonne des prix."""
    from .layout import price_column_bounds
    from .rules.common import normalized
    import cv2
    import numpy as np

    bounds = price_column_bounds(blocks)
    totals = printed_total_blocks(blocks)
    if bounds is None or not totals:
        return None
    anchors = [b for b in blocks if re.match(
        r'^(?:MAX[IT]|SUPER|BIENVENUE|(?:\d{1,2}[-–])?EPICERIE|FRUIT)', normalized(b.text))]
    if not anchors:
        return None
    left = max(0, min(b.x for b in anchors) - .025)
    top = max(0, min(b.y for b in anchors) - .015)
    ending = min(totals, key=lambda b: b.y)
    bottom = min(1, ending.y + max(.03, ending.height * 3))
    right = price_column_bounds(blocks, include_totals=False)[0]
    pixels = cv2.imdecode(np.frombuffer(image.read_bytes(), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        return None
    height, width = pixels.shape
    x0, x1 = int(left * width), round(right * width)
    y0, y1 = int(top * height), round(bottom * height)
    crop = pixels[y0:y1, x0:x1]
    if not crop.size:
        return None
    crop = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    crop = cv2.copyMakeBorder(crop, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    path = temporary / 'descriptions.png'
    path.write_bytes(cv2.imencode('.png', crop)[1].tobytes())
    recognized, _ = recognize(path, engine, tesseract_psm=6)
    result = [b for b in blocks if not (b.x < right and top <= b.y + b.height / 2 <= bottom)]
    for index, b in enumerate(recognized):
        result.append(OCRBlock(text=b.text, confidence=b.confidence,
            x=max(0, (x0 + (b.x * crop.shape[1] - 20) / 2) / width),
            y=max(0, (y0 + (b.y * crop.shape[0] - 20) / 2) / height),
            width=b.width * crop.shape[1] / 2 / width,
            height=b.height * crop.shape[0] / 2 / height,
            line_key='text-column:' + (b.line_key or str(index))))
    return result
