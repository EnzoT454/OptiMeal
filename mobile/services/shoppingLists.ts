import { randomUUID } from 'expo-crypto';
import { api } from './api';
import type { ShoppingCalendarPreviewRead, ShoppingCalendarPreviewWrite, ShoppingDetail, ShoppingListRead, ShoppingPage, ShoppingComparisonRead, ShoppingScenarioName } from '../types/shoppingLists';

export const listsPath = '/api/v1/shopping-lists';
export interface ListCommand { key: string; path: string; method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body: object; }
export function listCommand(path: string, body: object, method: ListCommand['method'] = 'POST'): ListCommand {
  return { key: randomUUID(), path, body, method };
}
export async function sendListCommand<T = ShoppingListRead>(command: ListCommand, userId: string): Promise<T> {
  const result = await api<ShoppingDetail<T>>(command.path, {
    method: command.method, headers: { 'Idempotency-Key': command.key }, body: JSON.stringify(command.body),
  }, true, 15000, userId);
  return result.item;
}
export const fetchLists = (offset = 0, collection?: 'current' | 'history') => api<ShoppingPage<ShoppingListRead>>(`${listsPath}?limit=20&offset=${offset}${collection ? `&collection=${collection}` : ''}`);
export async function fetchList(id: string, userId?: string) {
  return (await api<ShoppingDetail<ShoppingListRead>>(`${listsPath}/${id}`, {}, true, 15000, userId)).item;
}
export async function previewCalendar(body: ShoppingCalendarPreviewWrite) {
  return (await api<ShoppingDetail<ShoppingCalendarPreviewRead>>(`${listsPath}/calendar-preview`, {
    method: 'POST', body: JSON.stringify(body),
  })).item;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function currentWeek() {
  const start = new Date();
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return { start_date: localDate(start), end_date: localDate(end) };
}
export const dateLabel = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
export const quantityLabel = (quantities: { amount: string; unit: string }[]) => quantities.length
  ? quantities.map(q => `${q.amount.replace('.', ',')} ${q.unit === 'unit' ? 'unité(s)' : q.unit}`).join(' + ')
  : 'Quantité à préciser';

export async function compareList(id: string, userId: string): Promise<ShoppingComparisonRead> {
  return (await api<ShoppingDetail<ShoppingComparisonRead>>(`${listsPath}/${id}/comparisons`, {
    method: 'POST',
  }, true, 15000, userId)).item;
}
export function applyComparisonCommand(comparison: ShoppingComparisonRead, scenario: ShoppingScenarioName, acceptPartial = false) {
  return listCommand(`${listsPath}/${comparison.list_id}/apply-comparison`, {
    expected_revision: comparison.source_revision, comparison_id: comparison.id,
    scenario, accept_partial: acceptPartial,
  });
}
