import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Recipe, Ingredient, ExchangeRates, RecipeIngredient } from '../types';

const STORAGE_KEY = '@imperio_galletil_recipes';

export const INITIAL_RECIPES: Recipe[] = [
  {
    id: 'cookies',
    title: 'Galletas Clasicas',
    subtitle: 'Receta tradicional y costeo exacto por tanda',
    batch_yield: 23,
    batch_cost_usd: 7.54,
    pack_cost_usd: 0.33,
    process: `1. Batir la mantequilla con el azucar hasta obtener una consistencia cremosa y suave.
2. Incorporar el huevo y la esencia de vainilla, integrando bien a velocidad media.
3. Tamizar la harina de trigo e integrarla con movimientos suaves sin amasar en exceso.
4. Añadir las chispas de chocolate y formar bolitas uniformes para cada galleta.
5. Colocar en bandeja y hornear a 180 grados durante 12 a 15 minutos hasta dorar bordes.
6. Dejar reposar en rejilla hasta enfriar por completo y colocar en bolsas de empaque.`,
    ingredients: [
      { name: 'Harina de trigo', amount: '1 kg', price_ves: 928.24, price_usd: 1.06, ingredient_name: 'Harina de trigo', ratio: 1.0 },
      { name: 'Mantequilla', amount: '1 empaque', price_ves: 1313.55, price_usd: 1.50, ingredient_name: 'Mantequilla', ratio: 1.0 },
      { name: 'Chispas de chocolate', amount: 'Mitad paquete', price_ves: 2189.25, price_usd: 2.50, ingredient_name: 'Chispas de chocolate', ratio: 0.5 },
      { name: 'Crema de chocolate', amount: '1 porcion', price_ves: 525.42, price_usd: 0.60, ingredient_name: 'Crema de chocolate', ratio: 0.1 },
      { name: 'Vainilla', amount: '1 porcion', price_ves: 218.93, price_usd: 0.25, ingredient_name: 'Vainilla', ratio: 0.1 },
      { name: 'Azucar', amount: '1 tercio paquete', price_ves: 437.85, price_usd: 0.50, ingredient_name: 'Azucar', ratio: 0.3333 },
      { name: 'Huevos', amount: '1 unidad', price_ves: 206.67, price_usd: 0.24, ingredient_name: 'Huevos', ratio: 0.0667 },
      { name: 'Bolsas de empaque', amount: '23 bolsas', price_ves: 604.23, price_usd: 0.69, ingredient_name: 'Bolsas de empaque', ratio: 0.23 },
    ],
  },
  {
    id: 'brownies',
    title: 'Brownie con Galleta',
    subtitle: 'Receta especial y costeo exacto por tanda',
    batch_yield: 8,
    batch_cost_usd: 9.11,
    pack_cost_usd: 1.14,
    process: `1. Derretir la mantequilla y mezclarla en tibio con el cacao en polvo y el azucar.
2. Incorporar los huevos uno a uno batiendo suavemente para conservar la densidad.
3. Agregar la mezcla base con espatula y verter en el molde preparado.
4. Colocar la capa de masa de galleta en la superficie de manera uniforme.
5. Hornear a 175 grados durante 25 minutos manteniendo el centro suave y humedo.
6. Dejar enfriar a temperatura ambiente, cortar en porciones y guardar en empaques individuales con cuchara.`,
    ingredients: [
      { name: 'Masa base de galleta', amount: 'Mezcla base', price_ves: 0, price_usd: 0, ratio: 0 },
      { name: 'Cacao en polvo', amount: '100 gramos', price_ves: 2189.25, price_usd: 2.50, ingredient_name: 'Cacao en polvo', ratio: 0.5 },
      { name: 'Mantequilla extra', amount: '1 empaque', price_ves: 1313.55, price_usd: 1.50, ingredient_name: 'Mantequilla', ratio: 1.0 },
      { name: 'Azucar', amount: '1 tercio paquete', price_ves: 437.85, price_usd: 0.50, ingredient_name: 'Azucar', ratio: 0.3333 },
      { name: 'Huevos frescos', amount: '6 unidades', price_ves: 1240.00, price_usd: 1.42, ingredient_name: 'Huevos', ratio: 0.4 },
      { name: 'Empaques individuales', amount: '8 empaques', price_ves: 1795.65, price_usd: 2.05, ingredient_name: 'Empaques individuales', ratio: 0.32 },
      { name: 'Cucharas plasticas', amount: '8 unidades', price_ves: 1000.00, price_usd: 1.14, ingredient_name: 'Cucharas plasticas', ratio: 0.16 },
    ],
  },
];

export function recalculateRecipeWithIngredients(
  recipe: Recipe,
  ingredients: Ingredient[],
  rates: ExchangeRates
): Recipe {
  let batchCostUsd = 0;

  const updatedIngredients: RecipeIngredient[] = recipe.ingredients.map((item) => {
    if (item.ratio === 0) {
      return {
        ...item,
        price_usd: 0,
        price_ves: 0,
      };
    }

    const searchTarget = (item.ingredient_name || item.name).toLowerCase().trim();
    const matched = ingredients.find((ing) => {
      const ingName = ing.name.toLowerCase().trim();
      return ingName === searchTarget || ingName.includes(searchTarget) || searchTarget.includes(ingName);
    });

    if (matched && typeof item.ratio === 'number') {
      const priceUsd = Number((matched.price_usd * item.ratio).toFixed(2));
      const priceVes = Number((priceUsd * rates.usd_ves).toFixed(2));
      batchCostUsd += priceUsd;
      return {
        ...item,
        price_usd: priceUsd,
        price_ves: priceVes,
      };
    }

    batchCostUsd += item.price_usd;
    return {
      ...item,
      price_ves: Number((item.price_usd * rates.usd_ves).toFixed(2)),
    };
  });

  const finalBatchUsd = Number(batchCostUsd.toFixed(2));
  const finalPackUsd = Number((finalBatchUsd / (recipe.batch_yield || 1)).toFixed(2));

  return {
    ...recipe,
    batch_cost_usd: finalBatchUsd,
    pack_cost_usd: finalPackUsd,
    ingredients: updatedIngredients,
  };
}

export function computeRecipesWithIngredients(
  recipes: Recipe[],
  ingredients: Ingredient[],
  rates: ExchangeRates
): Recipe[] {
  return recipes.map((r) => recalculateRecipeWithIngredients(r, ingredients, rates));
}

export async function getCachedRecipes(): Promise<Recipe[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading cached recipes', err);
  }
  return INITIAL_RECIPES;
}

export async function setCachedRecipes(items: Recipe[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Error saving cached recipes', err);
  }
}

export async function fetchRecipes(): Promise<Recipe[]> {
  let list: Recipe[] = [];

  try {
    const { data, error } = await supabase.from('recipes').select('*');
    if (!error && data && data.length > 0) {
      list = data.map((r: any) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle || '',
        batch_yield: Number(r.batch_yield),
        batch_cost_usd: Number(r.batch_cost_usd),
        pack_cost_usd: Number(r.pack_cost_usd),
        process: r.process || '',
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        created_at: r.created_at,
      }));
    }
  } catch (err) {
    console.warn('Error fetching recipes from Supabase', err);
  }

  if (list.length === 0) {
    list = await getCachedRecipes();
  } else {
    await setCachedRecipes(list);
  }

  return list;
}

export async function updateRecipeProcessInBackend(
  recipeId: string,
  newProcess: string
): Promise<void> {
  try {
    await supabase
      .from('recipes')
      .update({ process: newProcess })
      .eq('id', recipeId);
  } catch (err) {
    console.warn('Error saving recipe process in Supabase', err);
  }
}
