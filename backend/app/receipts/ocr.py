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


def validate_blocks(value: object) -> list[OCRBlock]:
    return TypeAdapter(list[OCRBlock]).validate_python(value)


def tesseract_blocks(tsv: str) -> list[OCRBlock]:
    rows = list(csv.DictReader(io.StringIO(tsv), delimiter='\t'))
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
              tesseract_psm: int = 4) -> tuple[list[OCRBlock], str]:
    if engine == 'auto':
        engine = 'vision' if platform.system() == 'Darwin' else 'tesseract'
    if engine == 'vision':
        if platform.system() != 'Darwin' or not shutil.which('swift'):
            raise ValueError('Vision nécessite macOS et Swift (outils de développement Apple).')
        root = Path(__file__).resolve().parents[3]
        cache = root / '.cache' / 'swift-receipts'
        cache.mkdir(parents=True, exist_ok=True)
        command = ['swift', '-module-cache-path', str(cache),
                   str(Path(__file__).with_name('vision_ocr.swift')), str(image.resolve())]
    else:
        if not shutil.which('tesseract'):
            raise ValueError('Installer Tesseract et ses langues fra/eng, ou utiliser Vision sur macOS.')
        if tesseract_psm not in (3, 4, 6, 11, 12):
            raise ValueError('PSM Tesseract pris en charge : 3, 4, 6, 11 ou 12.')
        # Les reçus sont habituellement une longue colonne aux tailles de texte variées.
        command = ['tesseract', str(image.resolve()), 'stdout', '-l', languages,
                   '--psm', str(tesseract_psm), 'tsv']
    result = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
    if result.returncode:
        raise ValueError(f'Échec OCR {engine} : {result.stderr.strip()}')
    blocks = (validate_blocks(json.loads(result.stdout)) if engine == 'vision'
              else tesseract_blocks(result.stdout))
    return blocks, engine
