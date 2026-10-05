import re
import unicodedata
from decimal import Decimal

AMOUNT = r'\d+[.,]\s*\d{2}'
END_AMOUNT = re.compile(rf'(?<![\d.,])(?P<amount>{AMOUNT})\s*\$?\s*$')
DETAIL = re.compile(
    rf'^\s*(?P<quantity>\d+(?:[.,]\d+)?)\s*(?P<unit>kg|lb)?\s*[@à]\s*\$?\s*'
    rf'(?P<price>{AMOUNT})(?:\s*/\s*(?P<basis>kg|lb))?'
    rf'(?:\s+\$?\s*(?P<total>{AMOUNT}))?\s*$', re.I,
)
TOTAL = re.compile(r'^(SOUS[ \-–—]*TOTAL|SUBTOTAL|TOTAL)(?:\s|:|$)')
STOP = re.compile(r'^(TYPE DE TRANS|COMPTE\s*:|TYPE DE CARTE|(?:C\.\s*)?CREDIT\b|DEBIT\b|'
                  r'VISA\b|MASTERCARD\b|PAIEMENT\b|PAYMENT\b|COMPTANT\b|CASH\b|'
                  r'MONNAIE\b|CHANGE\b|INTERAC\b|NOMBRE D.ARTICLES|\*{3,})')
ADJUSTMENT = re.compile(r'\b(RABAIS|R[ÉE]DUCTION|COUPON|DISCOUNT|REMISE|CONSIGNE|DEPOT|DEPOSIT|REMBOURSEMENT)\b')


def normalized(text: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKD', text.upper())
                   if not unicodedata.combining(c)).strip()


def decimal(text: str) -> Decimal:
    return Decimal(text.replace(' ', '').replace(',', '.'))


def trailing_amount(text: str) -> tuple[str, Decimal | None]:
    match = END_AMOUNT.search(text)
    prefix = text[:match.start()].rstrip().removesuffix('$').rstrip() if match else ''
    if not match or prefix.endswith(('-', '−')):
        return text.strip(), None
    return prefix, decimal(match['amount'])
