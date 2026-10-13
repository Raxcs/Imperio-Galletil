import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withTimeout } from '../lib/supabase';
import { Ingredient } from '../types';

const STORAGE_KEY = '@imperio_galletil_ingredients';

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
  if (typeof item.presentation === 'string' && item.presentation.startsWith('__DELETED__')) return true;
  if (Array.isArray(item.category) && (item.category.includes('archived') || item.category.includes('deleted'))) return true;
  if (deletedIds && deletedIds.has(item.id)) return true;
  return false;
}

export async function fetchIngredients(): Promise<Ingredient[]> {
  const deletedIdsList = await getDeletedIngredientIds();
  const deletedIdsSet = new Set(deletedIdsList);
  let list: Ingredient[] = [];
  let isFetchSuccess = false;

  // 1. Try Supabase English table 'ingredients' with timeout
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('ingredients')
        .select('*')
        .order('created_at', { ascending: true })
    );

    if (!error && Array.isArray(data)) {
      isFetchSuccess = true;
      list = data.map((item: any) => ({
        id: String(item.id),
        name: item.name,
        presentation: item.presentation,
        category: Array.isArray(item.category) ? item.category : [item.category],
        price_usd: Number(item.price_usd),
        price_ves: Number(item.price_ves),
        selected: false,
        created_at: item.created_at,
      }));
    } else if (error) {
      // 2. Try Supabase fallback Spanish table 'insumos' if table was not migrated yet
      const { data: fallbackData, error: fallbackError } = await withTimeout(
        supabase
          .from('insumos')
          .select('*')
          .order('created_at', { ascending: true })
      );

      if (!fallbackError && Array.isArray(fallbackData)) {
        isFetchSuccess = true;
        list = fallbackData.map((item: any) => ({
          id: String(item.id),
          name: item.name,
          presentation: item.presentation,
          category: Array.isArray(item.category) ? item.category : [item.category],
          price_usd: Number(item.price_usd),
          price_ves: Number(item.price_ves),
          selected: false,
          created_at: item.created_at,
        }));
      }
    }
  } catch (err) {
    console.warn('Supabase ingredients fetch failed, using local cache', err);
  }

  // Fallback to local cache if remote fetch failed
  const localList = await getCachedIngredients();
  const activeLocalList = localList.filter((item) => !isIngredientDeleted(item, deletedIdsSet));

  if (!isFetchSuccess) {
    return activeLocalList;
  }

  // Filtrar catalogo remoto excluyendo insumos eliminados logicamente
  const activeRemoteList = list.filter((item) => !isIngredientDeleted(item, deletedIdsSet));
  const remoteMap = new Map(activeRemoteList.map((item) => [item.id, item]));
  const localMap = new Map(activeLocalList.map((item) => [item.id, item]));

  const merged: Ingredient[] = activeRemoteList.map((remoteItem) => {
    const localItem = localMap.get(remoteItem.id);
    return {
      ...remoteItem,
      selected: localItem ? !!localItem.selected : false,
      price_usd: localItem ? localItem.price_usd : remoteItem.price_usd,
      price_ves: localItem ? localItem.price_ves : remoteItem.price_ves,
    };
  });

  // Preserve any custom ingredients added locally by the user
  for (const localItem of activeLocalList) {
    if (!remoteMap.has(localItem.id) && !deletedIdsSet.has(localItem.id)) {
      merged.push(localItem);
      if (localItem.id.startsWith('local_')) {
        createIngredientInBackend(localItem).catch(() => {});
      }
    }
  }

  await setCachedIngredients(merged);
  return merged;
}

export async function updateIngredientPriceInBackend(
  id: string,
  priceUsd: number,
  priceVes: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from('ingredients')
      .update({ price_usd: priceUsd, price_ves: priceVes })
      .eq('id', id);

    if (error) {
      await supabase
        .from('insumos')
        .update({ price_usd: priceUsd, price_ves: priceVes })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('Error updating ingredient price in Supabase', err);
  }
}

export async function createIngredientInBackend(
  item: Omit<Ingredient, 'id'>
): Promise<Ingredient | null> {
  try {
    const payload = {
      name: item.name,
      presentation: item.presentation,
      category: item.category,
      price_usd: item.price_usd,
      price_ves: item.price_ves,
    };

    const { data, error } = await supabase
      .from('ingredients')
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return {
        id: String(data.id),
        name: data.name,
        presentation: data.presentation,
        category: data.category,
        price_usd: Number(data.price_usd),
        price_ves: Number(data.price_ves),
        selected: false,
        created_at: data.created_at,
      };
    }

    // Fallback to insumos if needed
    const { data: fbData, error: fbError } = await supabase
      .from('insumos')
      .insert(payload)
      .select()
      .single();

    if (!fbError && fbData) {
      return {
        id: String(fbData.id),
        name: fbData.name,
        presentation: fbData.presentation,
        category: fbData.category,
        price_usd: Number(fbData.price_usd),
        price_ves: Number(fbData.price_ves),
        selected: false,
        created_at: fbData.created_at,
      };
    }
  } catch (err) {
    console.warn('Error creating ingredient in Supabase', err);
  }

  return null;
}

export async function updateIngredientInBackend(item: Ingredient): Promise<void> {
  try {
    const payload = {
      name: item.name,
      presentation: item.presentation,
      category: item.category,
      price_usd: item.price_usd,
      price_ves: item.price_ves,
    };

    const { error } = await supabase
      .from('ingredients')
      .update(payload)
      .eq('id', item.id);

    if (error) {
      await supabase
        .from('insumos')
        .update(payload)
        .eq('id', item.id);
    }
  } catch (err) {
    console.warn('Error updating ingredient in Supabase', err);
  }
}

export async function deleteIngredientInBackend(id: string, item?: Ingredient): Promise<void> {
  // Soft delete: Nunca se borra permanentemente de la base de datos
  await addDeletedIngredientId(id);
  try {
    const pres = item?.presentation || '';
    const newPres = pres.startsWith('__DELETED__') ? pres : '__DELETED__' + pres;
    const cats = Array.isArray(item?.category) ? item.category : [];
    const newCats = Array.from(new Set([...cats, 'archived']));

    const { error } = await supabase
      .from('ingredients')
      .update({ presentation: newPres, category: newCats })
      .eq('id', id);

    if (error) {
      await supabase
        .from('insumos')
        .update({ presentation: newPres, category: newCats })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('Error soft deleting ingredient in Supabase', err);
  }
}

export async function restoreIngredientInBackend(id: string, item: Ingredient): Promise<void> {
  await removeDeletedIngredientId(id);
  try {
    const cleanPres = (item.presentation || '').replace(/^__DELETED__/, '');
    const cleanCats = (item.category || []).filter((c) => c !== 'archived' && c !== 'deleted');

    const { error } = await supabase
      .from('ingredients')
      .update({ presentation: cleanPres, category: cleanCats })
      .eq('id', id);

    if (error) {
      await supabase
        .from('insumos')
        .update({ presentation: cleanPres, category: cleanCats })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('Error restoring ingredient in Supabase', err);
  }
}


