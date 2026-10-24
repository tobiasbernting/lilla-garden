import { item } from './data.ts';
import type { Inventory, ItemStack } from './types.ts';
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
