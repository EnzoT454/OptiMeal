import { api } from './api';
import { listsPath } from './shoppingLists';
import type { ShoppingDetail, ShoppingPage, ShoppingRevisionRead, ShoppingRevisionSummary,
  ShoppingTemplateRead, ShoppingExclusionRead } from '../types/shoppingLists';

export const templatesPath = '/api/v1/shopping-list-templates';
export const exclusionsPath = '/api/v1/shopping-list-exclusions';
export const fetchTemplates = (offset = 0) => api<ShoppingPage<ShoppingTemplateRead>>(`${templatesPath}?limit=20&offset=${offset}`);
export const fetchTemplate = async (id: string) => (await api<ShoppingDetail<ShoppingTemplateRead>>(`${templatesPath}/${id}`)).item;
export const fetchExclusions = (offset = 0) => api<ShoppingPage<ShoppingExclusionRead>>(`${exclusionsPath}?limit=20&offset=${offset}`);
export const fetchRevisions = (id: string, offset = 0) => api<ShoppingPage<ShoppingRevisionSummary>>(`${listsPath}/${id}/revisions?limit=20&offset=${offset}`);
export const fetchRevision = async (id: string, revision: number) => (await api<ShoppingDetail<ShoppingRevisionRead>>(`${listsPath}/${id}/revisions/${revision}`)).item;
export const timestampLabel = (value: string) => new Date(value).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' });
export const templateIcons = { basket: '🧺', cart: '🛒', leaf: '🌿', restaurant: '🍽', home: '🏠' } as const;
