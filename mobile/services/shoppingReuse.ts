import { api } from './api';
import type { ShoppingDetail, ShoppingPage,
  ShoppingTemplateRead, ShoppingExclusionRead } from '../types/shoppingLists';

export const templatesPath = '/api/v1/shopping-list-templates';
export const exclusionsPath = '/api/v1/shopping-list-exclusions';
export const fetchTemplates = (offset = 0, userId?: string) => api<ShoppingPage<ShoppingTemplateRead>>(`${templatesPath}?limit=20&offset=${offset}`, {}, true, 15000, userId);
export const fetchTemplate = async (id: string, userId?: string) => (await api<ShoppingDetail<ShoppingTemplateRead>>(`${templatesPath}/${id}`, {}, true, 15000, userId)).item;
export const fetchExclusions = (offset = 0) => api<ShoppingPage<ShoppingExclusionRead>>(`${exclusionsPath}?limit=20&offset=${offset}`);
export const timestampLabel = (value: string) => new Date(value).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' });
export const templateIcons = { basket: '🧺', cart: '🛒', leaf: '🌿', restaurant: '🍽', home: '🏠' } as const;
