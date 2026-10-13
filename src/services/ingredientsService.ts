import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withTimeout } from '../lib/supabase';
import {
  createIdSetStore,
  generateId,
  isUuid,
  mergeWithRemote,
  singleFlight,
  stripDeletedPrefix,
  DELETED_PREFIX,
} from '../lib/sync';
import { Ingredient } from '../types';

const STORAGE_KEY = '@imperio_galletil_ingredients';
const TABLE = 'ingredients';

const pendingIngredients = createIdSetStore('@imperio_galletil_pending_ingredients');

export const INITIAL_INGREDIENTS: Ingredient[] = [
  {
    id: '1',
    name: 'Harina de trigo',
    category: ['galletas', 'brownies'],
    presentation: 'Paquete de 1 kg',
    price_ves: 928.24,
    price_usd: 1.06,
    selected: true,
  },
  {
    id: '2',
    name: 'Mantequilla',
    category: ['galletas', 'brownies'],
    presentation: 'Empaque de 200g',
    price_ves: 1313.55,
    price_usd: 1.50,
    selected: true,
  },
  {
    id: '3',
    name: 'Huevos',
    category: ['galletas', 'brownies'],
    presentation: 'Medio carton de 15 unidades',
    price_ves: 3100.00,
    price_usd: 3.54,
    selected: true,
  },
  {
    id: '4',
    name: 'Chispas de chocolate',
    category: ['galletas'],
    presentation: 'Bolsa para 2 tandas',
    price_ves: 4378.51,
    price_usd: 5.00,
    selected: false,
  },
  {
    id: '5',
    name: 'Crema de chocolate',
    category: ['galletas', 'brownies'],
    presentation: 'Envase comercial',
    price_ves: 5254.21,
    price_usd: 6.00,
    selected: false,
  },
  {
    id: '6',
    name: 'Vainilla',
    category: ['galletas', 'brownies'],
    presentation: 'Frasco de esencia',
    price_ves: 2189.25,
    price_usd: 2.50,
    selected: false,
  },
  {
    id: '7',
    name: 'Azucar',
    category: ['galletas', 'brownies'],
    presentation: 'Paquete de 1 kg',
    price_ves: 1313.55,
    price_usd: 1.50,
    selected: false,
  },
  {
    id: '8',
    name: 'Bolsas de empaque',
    category: ['empaques'],
    presentation: 'Paquete de 100 bolsas',
    price_ves: 2627.10,
    price_usd: 3.00,
    selected: false,
  },
  {
    id: '9',
    name: 'Cacao en polvo',
    category: ['brownies'],
    presentation: 'Empaque de 200g',
    price_ves: 4378.50,
    price_usd: 5.00,
    selected: false,
  },
  {
    id: '10',
    name: 'Empaques individuales',
    category: ['empaques'],
    presentation: 'Paquete de 25 empaques',
    price_ves: 5604.48,
    price_usd: 6.40,
    selected: false,
  },
  {
    id: '11',
    name: 'Cucharas plasticas',
    category: ['empaques'],
    presentation: 'Paquete de 50 unidades',
    price_ves: 6235.00,
    price_usd: 7.12,
    selected: false,
  },
];

export async function getCachedIngredients(): Promise<Ingredient[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading cached ingredients', err);
  }
  return INITIAL_INGREDIENTS;
}

export async function setCachedIngredients(items: Ingredient[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Error saving ingredients cache', err);
  }
}

const DELETED_KEY = '@imperio_galletil_deleted_ingredients';

export async function getDeletedIngredientIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading deleted ingredients cache', err);
  }
  return [];
}

export async function addDeletedIngredientId(id: string): Promise<void> {
  try {
    const current = await getDeletedIngredientIds();
    if (!current.includes(id)) {
      await AsyncStorage.setItem(DELETED_KEY, JSON.stringify([...current, id]));
    }
  } catch (err) {
    console.warn('Error saving deleted ingredient id', err);
  }
}

export async function removeDeletedIngredientId(id: string): Promise<void> {
  try {
    const current = await getDeletedIngredientIds();
    const filtered = current.filter((x) => x !== id);
    await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Error removing deleted ingredient id', err);
  }
}

export function isIngredientDeleted(item: Ingredient, deletedIds?: Set<string>): boolean {
  if (item.deleted || item.is_deleted) return true;
  if (typeof item.presentation === 'string' && item.presentation.startsWith(DELETED_PREFIX)) return true;
  if (Array.isArray(item.category) && (item.category.includes('archived') || item.category.includes('deleted'))) return true;
  if (deletedIds && deletedIds.has(item.id)) return true;
  return false;
}

/** Content fingerprint used to recognize legacy local ingredients that already exist remotely. */
export function ingredientContentKey(item: Ingredient): string {
  return stripDeletedPrefix(item.name).trim().toLowerCase();
}

function fromRow(item: any): Ingredient {
  return {
    id: String(item.id),
    name: item.name,
    presentation: item.presentation,
    category: Array.isArray(item.category) ? item.category : [item.category],
    price_usd: Number(item.price_usd),
    price_ves: Number(item.price_ves),
    selected: false,
    created_at: item.created_at,
  };
}

function toRow(item: Ingredient) {
  return {
    id: item.id,
    name: item.name,
    presentation: item.presentation,
    category: item.category,
    price_usd: item.price_usd,
    price_ves: item.price_ves,
  };
}

/**
 * Idempotent save: the id is generated on the device, so retries never duplicate rows.
 * The id stays in the pending set until the server confirms the write.
 */
async function upsertIngredient(item: Ingredient): Promise<Ingredient> {
  await pendingIngredients.add(item.id);
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).upsert(toRow(item), { onConflict: 'id' }).select().single()
    );
    if (!error && data) {
      await pendingIngredients.remove(item.id);
      return { ...fromRow(data), selected: !!item.selected };
    }
    if (error) console.warn('Error upserting ingredient in Supabase', error);
  } catch (err) {
    console.warn('Error upserting ingredient in Supabase', err);
  }
  return item;
}

async function syncIngredients(): Promise<Ingredient[]> {
  const deletedIdsSet = new Set(await getDeletedIngredientIds());
  const localList = await getCachedIngredients();
  const activeLocalList = localList.filter((item) => !isIngredientDeleted(item, deletedIdsSet));

  let remoteAll: Ingredient[] | null = null;
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).select('*').order('created_at', { ascending: true })
    );
    if (!error && Array.isArray(data)) {
      remoteAll = data.map(fromRow);
    } else if (error) {
      console.warn('Supabase ingredients fetch failed, using local cache', error);
    }
  } catch (err) {
    console.warn('Supabase ingredients fetch failed, using local cache', err);
  }

  // Fallback to local cache if remote fetch failed
  if (!remoteAll) {
    return activeLocalList;
  }

  const { merged, toUpsert } = mergeWithRemote({
    // Filtrar catalogo remoto excluyendo insumos eliminados logicamente
    remote: remoteAll.filter((item) => !isIngredientDeleted(item, deletedIdsSet)),
    remoteAll,
    local: activeLocalList,
    pendingIds: await pendingIngredients.getAll(),
    contentKey: ingredientContentKey,
    // Selection is a local-only UI state
    combine: (remoteItem, localItem) => ({
      ...remoteItem,
      selected: localItem ? !!localItem.selected : false,
    }),
  });

  await pendingIngredients.addMany(toUpsert.map((i) => i.id));
  await setCachedIngredients(merged);
  await Promise.allSettled(toUpsert.map(upsertIngredient));

  return merged;
}

export const fetchIngredients = singleFlight(syncIngredients);

export async function updateIngredientPriceInBackend(
  id: string,
  priceUsd: number,
  priceVes: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ price_usd: priceUsd, price_ves: priceVes })
      .eq('id', id);
    if (!error) return;
    console.warn('Error updating ingredient price in Supabase', error);
  } catch (err) {
    console.warn('Error updating ingredient price in Supabase', err);
  }
  if (isUuid(id)) await pendingIngredients.add(id);
}

export async function createIngredientInBackend(
  item: Omit<Ingredient, 'id'> | Ingredient
): Promise<Ingredient> {
  const currentId = 'id' in item ? item.id : undefined;
  const withId: Ingredient = { ...item, id: isUuid(currentId) ? currentId : generateId() };
  return upsertIngredient(withId);
}

export async function updateIngredientInBackend(item: Ingredient): Promise<void> {
  if (!isUuid(item.id)) return; // legacy record, it will be migrated on next sync
  await upsertIngredient(item);
}

export async function deleteIngredientInBackend(id: string, item?: Ingredient): Promise<void> {
  // Soft delete: Nunca se borra permanentemente de la base de datos
  await addDeletedIngredientId(id);
  try {
    const pres = item?.presentation || '';
    const newPres = pres.startsWith(DELETED_PREFIX) ? pres : DELETED_PREFIX + pres;
    const cats = Array.isArray(item?.category) ? item.category : [];
    const newCats = Array.from(new Set([...cats, 'archived']));

    const { error } = await supabase
      .from(TABLE)
      .update({ presentation: newPres, category: newCats })
      .eq('id', id);
    if (error) console.warn('Error soft deleting ingredient in Supabase', error);
  } catch (err) {
    console.warn('Error soft deleting ingredient in Supabase', err);
  }
}

export async function restoreIngredientInBackend(id: string, item: Ingredient): Promise<void> {
  await removeDeletedIngredientId(id);
  try {
    const cleanPres = stripDeletedPrefix(item.presentation);
    const cleanCats = (item.category || []).filter((c) => c !== 'archived' && c !== 'deleted');

    const { error } = await supabase
      .from(TABLE)
      .update({ presentation: cleanPres, category: cleanCats })
      .eq('id', id);
    if (error) console.warn('Error restoring ingredient in Supabase', error);
  } catch (err) {
    console.warn('Error restoring ingredient in Supabase', err);
  }
}
