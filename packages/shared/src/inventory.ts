import { ITEMS, item } from './data.ts';
import { itemName } from './sv.ts';
import type { Inventory, ItemCategory, ItemStack } from './types.ts';
import { MAX_STACK, WATERING_CAN_CHARGES } from './types.ts';

export const makeInventory = (size: number): Inventory => Array.from({ length: size }, () => null);

export const makeStack = (id: string, count = 1): ItemStack => {
  const s: ItemStack = { item: id, count };
  if (item(id).tool === 'can') s.charges = WATERING_CAN_CHARGES;
  return s;
};

/** Adds `count` of `id`; returns the number that did not fit. */
export function addItem(inv: Inventory, id: string, count: number): number {
  const def = item(id);
  const max = Math.min(def.stack, MAX_STACK);
  let left = count;
  // Fill existing stacks first
  for (const s of inv) {
    if (left <= 0) break;
    if (s && s.item === id && s.count < max && s.data === undefined) {
      const take = Math.min(max - s.count, left);
      s.count += take;
      left -= take;
    }
  }
  // Then empty slots
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (inv[i] === null) {
      const take = Math.min(max, left);
      inv[i] = makeStack(id, take);
      left -= take;
    }
  }
  return left;
}

export function countItem(inv: Inventory, id: string): number {
  let n = 0;
  for (const s of inv) if (s && s.item === id) n += s.count;
  return n;
}

/** Removes `count` of `id`; returns false (and removes nothing) if not enough. */
export function removeItem(inv: Inventory, id: string, count: number): boolean {
  if (countItem(inv, id) < count) return false;
  let left = count;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const s = inv[i];
    if (s && s.item === id) {
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count === 0) inv[i] = null;
    }
  }
  return true;
}

/** Removes `count` from a specific slot. */
export function takeFromSlot(inv: Inventory, slot: number, count: number): ItemStack | null {
  const s = inv[slot];
  if (!s) return null;
  const take = Math.min(count, s.count);
  const out: ItemStack = { ...s, count: take };
  s.count -= take;
  if (s.count === 0) inv[slot] = null;
  return out;
}

/** Swap or merge two slots, possibly across two inventories. */
export function moveStack(a: Inventory, ia: number, b: Inventory, ib: number): void {
  const sa = a[ia];
  const sb = b[ib];
  if (ia < 0 || ia >= a.length || ib < 0 || ib >= b.length) return;
  if (sa && sb && sa.item === sb.item && sa.charges === undefined && sa.data === undefined && sb.data === undefined) {
    const max = Math.min(item(sa.item).stack, MAX_STACK);
    const take = Math.min(max - sb.count, sa.count);
    sb.count += take;
    sa.count -= take;
    if (sa.count === 0) a[ia] = null;
    return;
  }
  a[ia] = sb ?? null;
  b[ib] = sa ?? null;
}

export const hasSpace = (inv: Inventory, id: string, count: number): boolean => {
  const def = item(id);
  const max = Math.min(def.stack, MAX_STACK);
  let room = 0;
  for (const s of inv) {
    if (s === null) room += max;
    else if (s.item === id) room += max - s.count;
    if (room >= count) return true;
  }
  return room >= count;
};

export const CATEGORY_ORDER: ItemCategory[] = [
  'tool',
  'seed',
  'crop',
  'animal_product',
  'fish',
  'feed',
  'material',
  'placeable',
  'clothing',
  'animal',
  'decor',
];

/** Stacks that carry per-stack state (paintings, watering can charges) never merge. */
const mergeable = (s: ItemStack): boolean => {
  if (s.data !== undefined || s.charges !== undefined) return false;
  const def = ITEMS[s.item];
  // Unknown items and corrupt over-max stacks are kept as they are, never merged or split.
  return def !== undefined && s.count <= Math.min(def.stack, MAX_STACK);
};

/**
 * Sorts slots [from, to) in place: merges stacks of the same item, then orders by
 * category, Swedish item name and count (largest first). Empty slots go last.
 */
export function sortInventory(inv: Inventory, from = 0, to = inv.length): void {
  const end = Math.min(to, inv.length);
  const start = Math.max(0, from);
  if (start >= end) return;
  const merged: ItemStack[] = [];
  const open = new Map<string, ItemStack>();
  for (let i = start; i < end; i++) {
    const s = inv[i];
    if (!s) continue;
    if (!mergeable(s)) {
      merged.push(s);
      continue;
    }
    const max = Math.min(ITEMS[s.item]!.stack, MAX_STACK);
    let left = s.count;
    while (left > 0) {
      const cur = open.get(s.item);
      if (cur && cur.count < max) {
        const take = Math.min(max - cur.count, left);
        cur.count += take;
        left -= take;
        if (cur.count >= max) open.delete(s.item);
      } else {
        const take = Math.min(max, left);
        const ns: ItemStack = { ...s, count: take };
        merged.push(ns);
        left -= take;
        if (take < max) open.set(s.item, ns);
        else open.delete(s.item);
      }
    }
  }
  const catIndex = (id: string): number => {
    const cat = ITEMS[id]?.category;
    const i = cat === undefined ? -1 : CATEGORY_ORDER.indexOf(cat);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  merged.sort(
    (a, b) =>
      catIndex(a.item) - catIndex(b.item) ||
      itemName(a.item).localeCompare(itemName(b.item), 'sv') ||
      a.item.localeCompare(b.item) ||
      b.count - a.count,
  );
  if (merged.length > end - start) return;
  for (let i = start; i < end; i++) inv[i] = merged[i - start] ?? null;
}

/**
 * Moves stacks from `from[fromStart, fromEnd)` into `to`, but only items that already
 * exist in `to` (never `skipSlot`, e.g. the held stack). Returns the number of items moved.
 */
export function quickStack(from: Inventory, fromStart: number, fromEnd: number, to: Inventory, skipSlot = -1): number {
  let moved = 0;
  for (let i = Math.max(0, fromStart); i < Math.min(fromEnd, from.length); i++) {
    if (i === skipSlot) continue;
    const s = from[i];
    if (!s || !ITEMS[s.item] || s.data !== undefined || s.charges !== undefined) continue;
    if (!to.some((t) => t && t.item === s.item && t.data === undefined && t.charges === undefined)) continue;
    const left = addItem(to, s.item, s.count);
    const took = s.count - left;
    moved += took;
    s.count = left;
    if (s.count === 0) from[i] = null;
  }
  return moved;
}
