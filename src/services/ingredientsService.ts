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

export async function fetchIngredients(): Promise<Ingredient[]> {
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

  // 3. Fallback to cached or initial if Supabase returned nothing or failed
  if (!isFetchSuccess || list.length === 0) {
    list = await getCachedIngredients();
  } else {
    // Preserve local selection state
    const cached = await getCachedIngredients();
    const selectionMap = new Map(cached.map((c) => [c.id, !!c.selected]));
    list = list.map((item) => ({
      ...item,
      selected: selectionMap.get(item.id) ?? false,
    }));
    await setCachedIngredients(list);
  }

  return list;
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
