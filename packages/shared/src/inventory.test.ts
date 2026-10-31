import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  INVENTORY_FILTERS,
  addItem,
  countItem,
  filterOf,
  item,
  itemMatches,
  itemName,
  makeInventory,
  makeStack,
  normalizeQuery,
  quickStack,
  sortInventory,
} from './index.ts';

describe('sortInventory', () => {
  it('consolidates stacks of the same item and empties go last', () => {
    const inv = makeInventory(8);
    inv[1] = { item: 'carrot', count: 10 };
    inv[4] = { item: 'carrot', count: 5 };
    inv[6] = { item: 'carrot', count: 99 };
    sortInventory(inv);
    expect(inv[0]).toEqual({ item: 'carrot', count: 99 });
    expect(inv[1]).toEqual({ item: 'carrot', count: 15 });
    expect(inv.slice(2).every((s) => s === null)).toBe(true);
    expect(countItem(inv, 'carrot')).toBe(114);
  });

  it('orders by category, then Swedish name, then count', () => {
    const inv = makeInventory(8);
    inv[0] = makeStack('potato', 3);
    inv[1] = makeStack('carrot_seed', 3);
    inv[2] = makeStack('hoe', 1);
    inv[3] = makeStack('carrot', 3);
    inv[4] = makeStack('strawberry', 3);
    sortInventory(inv);
    const ids = inv.filter(Boolean).map((s) => s!.item);
    const rank = (id: string) => CATEGORY_ORDER.indexOf(item(id).category);
    for (let i = 1; i < ids.length; i++) expect(rank(ids[i - 1]!)).toBeLessThanOrEqual(rank(ids[i]!));
    expect(ids[0]).toBe('hoe');
    expect(ids[1]).toBe('carrot_seed');
    const crops = ids.slice(2).map(itemName);
    expect(crops).toEqual([...crops].sort((a, b) => a.localeCompare(b, 'sv')));
  });

  it('only touches the given range', () => {
    const inv = makeInventory(16);
    inv[0] = makeStack('potato', 1);
    inv[1] = makeStack('hoe', 1);
    inv[9] = makeStack('potato', 2);
    inv[8] = makeStack('hoe', 1);
    inv[12] = makeStack('potato', 4);
    const before = [inv[0], inv[1]];
    sortInventory(inv, 8, 16);
    expect(inv[0]).toBe(before[0]);
    expect(inv[1]).toBe(before[1]);
    expect(inv[8]?.item).toBe('hoe');
    expect(inv[9]).toEqual({ item: 'potato', count: 6 });
    expect(inv[10]).toBeNull();
  });

  it('never drops items when stacks are over the max (corrupt data)', () => {
    const inv = makeInventory(4);
    for (let i = 0; i < 4; i++) inv[i] = { item: 'carrot', count: 150 };
    sortInventory(inv);
    expect(countItem(inv, 'carrot')).toBe(600);
  });

  it('sorts unknown items last without throwing and keeps them', () => {
    const inv = makeInventory(6);
    inv[0] = { item: 'nope', count: 1 };
    inv[1] = { item: 'nope', count: 2 };
    inv[2] = makeStack('carrot', 3);
    expect(() => sortInventory(inv)).not.toThrow();
    expect(inv[0]?.item).toBe('carrot');
    expect(inv.filter((s) => s?.item === 'nope').map((s) => s!.count).sort()).toEqual([1, 2]);
  });

  it('never merges stacks with data or charges', () => {
    const inv = makeInventory(8);
    inv[0] = { item: 'carrot', count: 1, data: 'abc' };
    inv[1] = { item: 'carrot', count: 1, data: 'def' };
    inv[2] = { item: 'carrot', count: 2 };
    inv[3] = { item: 'carrot', count: 3 };
    inv[4] = makeStack('can');
    inv[5] = makeStack('can');
    sortInventory(inv);
    expect(inv.filter((s) => s?.item === 'carrot' && s.data !== undefined)).toHaveLength(2);
    expect(inv.filter((s) => s?.item === 'carrot' && s.data === undefined)).toEqual([{ item: 'carrot', count: 5 }]);
    expect(inv.filter((s) => s?.item === 'can')).toHaveLength(2);
    expect(inv.filter((s) => s?.item === 'can').every((s) => s!.charges !== undefined)).toBe(true);
  });
});

describe('quickStack', () => {
  it('skips the given slot and unknown items', () => {
    const from = makeInventory(8);
    const to = makeInventory(8);
    to[0] = { item: 'carrot', count: 1 };
    from[1] = { item: 'carrot', count: 2 };
    from[2] = { item: 'carrot', count: 3 };
    from[3] = { item: 'nope', count: 1 };
    to[1] = { item: 'nope', count: 1 };
    expect(() => quickStack(from, 0, 8, to, 2)).not.toThrow();
    expect(from[2]).toEqual({ item: 'carrot', count: 3 });
    expect(from[1]).toBeNull();
    expect(from[3]).toEqual({ item: 'nope', count: 1 });
  });

  it('moves only items already present in the target and returns the count', () => {
    const from = makeInventory(8);
    from[0] = makeStack('carrot', 5);
    from[1] = makeStack('potato', 4);
    from[2] = makeStack('hoe', 1);
    const to = makeInventory(8);
    to[3] = makeStack('carrot', 10);
    to[5] = makeStack('hoe', 1);
    const n = quickStack(from, 0, 8, to);
    expect(n).toBe(6);
    expect(to[3]).toEqual({ item: 'carrot', count: 15 });
    expect(from[0]).toBeNull();
    expect(from[1]).toEqual({ item: 'potato', count: 4 });
    // hoe stacks to 1, the next free slot takes it
    expect(countItem(to, 'hoe')).toBe(2);
    expect(from[2]).toBeNull();
  });

  it('keeps the remainder when the target is full', () => {
    const from = makeInventory(4);
    from[0] = makeStack('carrot', 50);
    const to = makeInventory(2);
    to[0] = makeStack('carrot', 90);
    to[1] = makeStack('potato', 1);
    const n = quickStack(from, 0, 4, to);
    expect(n).toBe(9);
    expect(to[0]!.count).toBe(99);
    expect(from[0]).toEqual({ item: 'carrot', count: 41 });
  });

  it('respects the source range and skips data stacks', () => {
    const from = makeInventory(16);
    from[2] = makeStack('carrot', 2);
    from[9] = makeStack('carrot', 3);
    from[10] = { item: 'carrot', count: 1, data: 'x' };
    const to = makeInventory(4);
    addItem(to, 'carrot', 1);
    expect(quickStack(from, 8, 16, to)).toBe(3);
    expect(from[2]).toEqual({ item: 'carrot', count: 2 });
    expect(from[10]?.data).toBe('x');
  });
});

describe('filters and search', () => {
  it('normalizes queries', () => {
    expect(normalizeQuery('  Mo   ROT ')).toBe('mo rot');
  });

  it('matches case-insensitively, with åäö, and empty matches all', () => {
    expect(itemMatches('carrot', '')).toBe(true);
    expect(itemMatches('carrot', '   ')).toBe(true);
    expect(itemMatches('carrot', itemName('carrot').toUpperCase())).toBe(true);
    expect(itemMatches('carrot', itemName('carrot').slice(0, 3).toLowerCase())).toBe(true);
    expect(itemMatches('carrot', 'zzz')).toBe(false);
  });

  it('matches the Swedish name, not the raw id, and never unknown ids', () => {
    expect(itemMatches('hat_straw', 'straw')).toBe(false);
    expect(itemMatches('hat_straw', 'hat_')).toBe(false);
    expect(itemMatches('hat_straw', 'stråhatt')).toBe(true);
    expect(itemMatches('carrot', 'carr')).toBe(false);
    expect(itemMatches('nope', 'nope')).toBe(false);
    expect(filterOf('nope')).toBe('other');
  });

  it('matches names with å, ä, ö', () => {
    expect(itemMatches('sword', 'svärd')).toBe(true);
    expect(itemMatches('sword', 'SVÄRD')).toBe(true);
    expect(itemMatches('sword', 'svard')).toBe(false);
    expect(itemMatches('gem', 'ädel')).toBe(true);
    expect(itemMatches('rod', 'spö')).toBe(true);
  });

  it('every item belongs to a known filter', () => {
    const ids = INVENTORY_FILTERS.map((f) => f.id);
    expect(filterOf('hoe')).toBe('tools');
    expect(filterOf('carrot_seed')).toBe('seeds');
    expect(filterOf('carrot')).toBe('food');
    expect(ids).toContain(filterOf('chest'));
  });
});
