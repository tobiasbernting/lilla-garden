import { ITEMS } from './data.ts';
import { itemName } from './sv.ts';
import type { ItemCategory } from './types.ts';

export interface InventoryFilter {
  id: string;
  emoji: string;
  categories: ItemCategory[];
}

export const INVENTORY_FILTERS: InventoryFilter[] = [
  { id: 'tools', emoji: '🔧', categories: ['tool'] },
  { id: 'seeds', emoji: '🌱', categories: ['seed'] },
  { id: 'food', emoji: '🥕', categories: ['crop', 'animal_product', 'fish', 'feed'] },
  { id: 'materials', emoji: '🪵', categories: ['material'] },
  { id: 'build', emoji: '🪑', categories: ['placeable', 'decor'] },
  { id: 'other', emoji: '🎁', categories: ['clothing', 'animal'] },
];

/** The filter an item belongs to ('other' if its category is unlisted). */
export function filterOf(itemId: string): InventoryFilter['id'] {
  const cat = ITEMS[itemId]?.category;
  if (cat === undefined) return 'other';
  return INVENTORY_FILTERS.find((f) => f.categories.includes(cat))?.id ?? 'other';
}

export const normalizeQuery = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * True if the item's Swedish name contains the query; empty query matches all. The raw id is
 * only used as a fallback when there is no Swedish name. Unknown ids never match a query.
 */
export function itemMatches(itemId: string, query: string): boolean {
  const q = normalizeQuery(query);
  if (q === '') return true;
  if (!ITEMS[itemId]) return false;
  const name = itemName(itemId);
  return normalizeQuery(name).includes(q) || (name === itemId && itemId.toLowerCase().includes(q));
}
