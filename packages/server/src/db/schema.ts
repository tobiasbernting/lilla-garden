import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnimalState, CropState, DropState, PlayerState, Terrain, WorldObject, WorldState } from '../../../shared/src/index.ts';

/** Single row (id = 1) with the world-wide state. */
export const world = pgTable('world', {
  id: integer('id').primaryKey(),
  day: integer('day').notNull(),
  timeMs: integer('time_ms').notNull(),
  nextId: integer('next_id').notNull(),
  seasonOverride: text('season_override'),
  terrain: jsonb('terrain').$type<Terrain[]>().notNull(),
  drops: jsonb('drops').$type<Record<number, DropState>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const objects = pgTable('objects', {
  id: integer('id').primaryKey(),
  kind: text('kind').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  data: jsonb('data').$type<WorldObject>().notNull(),
});

export const crops = pgTable('crops', {
  k: text('k').primaryKey(),
  data: jsonb('data').$type<CropState>().notNull(),
});

export const animals = pgTable('animals', {
  id: integer('id').primaryKey(),
  species: text('species').notNull(),
  name: text('name').notNull(),
  data: jsonb('data').$type<AnimalState>().notNull(),
});

export const players = pgTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: jsonb('data').$type<PlayerState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Generated overworld areas that have been visited (full state as JSON). */
export const areas = pgTable('areas', {
  key: text('key').primaryKey(),
  biome: text('biome').notNull(),
  data: jsonb('data').$type<WorldState>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
