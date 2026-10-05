"""Contrôles communs : ne jamais modifier un montant pour faire coïncider les totaux."""
from decimal import ROUND_HALF_UP, Decimal

from .schemas import ReceiptAdjustment, ReceiptItem, ReceiptTotals


def validate_totals(items: list[ReceiptItem], adjustments: list[ReceiptAdjustment],
                    subtotal: Decimal | None, total: Decimal | None,
                    taxes: Decimal | None, unparsed: list[str]) -> ReceiptTotals:
    for item in items:
        if item.line_total is None:
            item.warnings.append('line_total_missing')
        if item.quantity is None:
            item.warnings.append('quantity_not_explicit')
        if item.quantity is not None and item.unit_price is not None and item.line_total is not None:
            expected = (item.quantity * item.unit_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if expected != item.line_total:
                item.warnings.append('quantity_times_price_mismatch')
    items_sum = sum((i.line_total or Decimal('0') for i in items), Decimal('0.00'))
    calculable = bool(items) and all(i.line_total is not None for i in items)
    calculable = calculable and not any(a.effect == 'unknown' for a in adjustments)
    net = (items_sum + sum((a.amount for a in adjustments if a.effect == 'applied'
                           and a.amount is not None), Decimal('0.00'))) if calculable else None
    difference = net - subtotal if net is not None and subtotal is not None else None
    status = 'unverifiable' if difference is None else 'matches' if difference == 0 else 'mismatch'
    if status == 'matches' and unparsed:
        status = 'unverifiable'
    tax_status = 'unverifiable'
    if subtotal is not None and taxes is not None and total is not None:
        tax_status = 'matches' if subtotal + taxes == total else 'mismatch'
    return ReceiptTotals(subtotal=subtotal, total=total, taxes=taxes, items_sum=items_sum,
                         calculated_subtotal=net, difference_from_subtotal=difference,
                         arithmetic_status=status, tax_check_status=tax_status)
