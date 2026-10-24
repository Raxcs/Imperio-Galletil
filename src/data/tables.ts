import { Debt, Ingredient, ProductionLog, Recipe } from '../types';
import { createCollection } from './collection';
import { createSupabaseTable } from './remote';

const byCreatedAsc = (a: { created_at?: string }, b: { created_at?: string }) =>
  (a.created_at ?? '').localeCompare(b.created_at ?? '');
const byCreatedDesc = (a: { created_at?: string }, b: { created_at?: string }) => byCreatedAsc(b, a);

const LEGACY_DELETED_CATEGORIES = ['archived', 'deleted'];

/** Ensures the row has the fields the UI relies on; unusable rows are skipped. */
const hasId = (row: any) => row && row.id !== null && row.id !== undefined && row.id !== '';

// ----- Debts -----

export const debtsCollection = createCollection<Debt>({
  name: 'debts',
  storageKey: '@imperio_galletil_v2_debts',
  sort: byCreatedDesc,
});

export const debtsRemote = createSupabaseTable<Debt>({
  table: 'debts',
  legacyDeletedColumns: ['note', 'name'],
  toRow: (d) => ({
    id: d.id,
    name: d.name,
    amount: d.amount,
    debt_date: d.debt_date,
    note: d.note || '',
    paid: d.paid,
    paid_date: d.paid_date || null,
    created_at: d.created_at,
  }),
  fromRow: (r) =>
    hasId(r)
      ? {
          id: String(r.id),
          name: r.name ?? '',
          amount: Number(r.amount),
          debt_date: r.debt_date,
          note: r.note || '',
          paid: !!r.paid,
          paid_date: r.paid_date ?? null,
          created_at: r.created_at,
        }
      : null,
});

// ----- Production logs -----

export const logsCollection = createCollection<ProductionLog>({
  name: 'production_logs',
  storageKey: '@imperio_galletil_v2_production_logs',
  sort: byCreatedDesc,
});

export const logsRemote = createSupabaseTable<ProductionLog>({
  table: 'production_logs',
  legacyDeletedColumns: ['name'],
  toRow: (l) => ({
    id: l.id,
    name: l.name,
    qty: l.qty,
    price_ves: l.price_ves,
    cost_ves: l.cost_ves,
    created_at: l.created_at,
  }),
  fromRow: (r) =>
    hasId(r)
      ? {
          id: String(r.id),
          name: r.name ?? '',
          qty: Number(r.qty),
          price_ves: Number(r.price_ves),
          cost_ves: Number(r.cost_ves),
          created_at: r.created_at,
        }
      : null,
});

// ----- Ingredients -----

export const ingredientsCollection = createCollection<Ingredient>({
  name: 'ingredients',
  storageKey: '@imperio_galletil_v2_ingredients',
  sort: byCreatedAsc,
});

export const ingredientsRemote = createSupabaseTable<Ingredient>({
  table: 'ingredients',
  legacyDeletedColumns: ['presentation'],
  isLegacyDeleted: (r) =>
    Array.isArray(r.category) && r.category.some((c: string) => LEGACY_DELETED_CATEGORIES.includes(c)),
  // `selected` is local UI state and never leaves the device
  toRow: (i) => ({
    id: i.id,
    name: i.name,
    presentation: i.presentation,
    category: i.category,
    price_usd: i.price_usd,
    price_ves: i.price_ves,
    created_at: i.created_at,
  }),
  fromRow: (r) =>
    hasId(r)
      ? {
          id: String(r.id),
          name: r.name ?? '',
          presentation: r.presentation ?? '',
          category: (Array.isArray(r.category) ? r.category : [r.category]).filter(
            (c: unknown) => typeof c === 'string' && !LEGACY_DELETED_CATEGORIES.includes(c)
          ),
          price_usd: Number(r.price_usd),
          price_ves: Number(r.price_ves),
          selected: false,
          created_at: r.created_at,
        }
      : null,
});

// ----- Recipes -----

export const recipesCollection = createCollection<Recipe>({
  name: 'recipes',
  storageKey: '@imperio_galletil_v2_recipes',
  sort: byCreatedAsc,
});

export const recipesRemote = createSupabaseTable<Recipe>({
  table: 'recipes',
  legacyDeletedColumns: ['subtitle'],
  toRow: (r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    batch_yield: r.batch_yield,
    batch_cost_usd: r.batch_cost_usd,
    pack_cost_usd: r.pack_cost_usd,
    process: r.process,
    ingredients: r.ingredients,
    created_at: r.created_at,
  }),
  fromRow: (r) =>
    hasId(r)
      ? {
          id: String(r.id),
          title: r.title ?? '',
          subtitle: r.subtitle || '',
          batch_yield: Number(r.batch_yield),
          batch_cost_usd: Number(r.batch_cost_usd),
          pack_cost_usd: Number(r.pack_cost_usd),
          process: r.process || '',
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
          created_at: r.created_at,
        }
      : null,
});
