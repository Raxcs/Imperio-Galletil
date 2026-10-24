import { Recipe, Ingredient, ExchangeRates, RecipeIngredient } from '../types';

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

export function getIngredientBase(ingredient: Ingredient): { base_qty: number; base_unit: string } {
  if (ingredient.base_qty && ingredient.base_unit) {
    return { base_qty: ingredient.base_qty, base_unit: ingredient.base_unit };
  }
  const pres = (ingredient.presentation || '').toLowerCase();
  if (pres.includes('1 kg') || pres.includes('1kg')) return { base_qty: 1000, base_unit: 'g' };
  if (pres.includes('200g') || pres.includes('200 g')) return { base_qty: 200, base_unit: 'g' };
  if (pres.includes('500g') || pres.includes('500 g')) return { base_qty: 500, base_unit: 'g' };
  if (pres.includes('250g') || pres.includes('250 g')) return { base_qty: 250, base_unit: 'g' };
  if (pres.includes('15')) return { base_qty: 15, base_unit: 'un' };
  if (pres.includes('100') || pres.includes('ciento')) return { base_qty: 100, base_unit: 'un' };
  return { base_qty: 1, base_unit: 'un' };
}

export function calcPortionCost(
  ingredient: Ingredient | undefined,
  usedQty: number,
  usedUnit: string
): number {
  if (!ingredient || !ingredient.price_usd || usedQty <= 0) return 0;
  const { base_qty, base_unit } = getIngredientBase(ingredient);

  let qtyInBaseUnit = usedQty;
  const bUnit = (base_unit || 'g').toLowerCase();
  const uUnit = (usedUnit || 'g').toLowerCase();

  // Unit conversions
  if (bUnit === 'g' && uUnit === 'kg') qtyInBaseUnit *= 1000;
  else if (bUnit === 'kg' && uUnit === 'g') qtyInBaseUnit /= 1000;
  else if (bUnit === 'ml' && uUnit === 'l') qtyInBaseUnit *= 1000;
  else if (bUnit === 'l' && uUnit === 'ml') qtyInBaseUnit /= 1000;

  const ratio = qtyInBaseUnit / (base_qty || 1);
  return Number((ingredient.price_usd * ratio).toFixed(2));
}

export function recalculateRecipeWithIngredients(
  recipe: Recipe,
  ingredients: Ingredient[],
  rates: ExchangeRates
): Recipe {
  let batchCostUsd = 0;

  const updatedIngredients: RecipeIngredient[] = recipe.ingredients.map((item) => {
    const searchTarget = (item.ingredient_name || item.name).toLowerCase().trim();
    const matched = ingredients.find((ing) => {
      if (item.ing_id && ing.id === item.ing_id) return true;
      const ingName = ing.name.toLowerCase().trim();
      return ingName === searchTarget || ingName.includes(searchTarget) || searchTarget.includes(ingName);
    });

    // 1. Calculation with specific used_qty and used_unit
    if (matched && typeof item.used_qty === 'number' && item.used_qty > 0) {
      const priceUsd = calcPortionCost(matched, item.used_qty, item.used_unit || 'g');
      const priceVes = Number((priceUsd * rates.usd_ves).toFixed(2));
      batchCostUsd += priceUsd;
      return {
        ...item,
        ing_id: matched.id,
        price_usd: priceUsd,
        price_ves: priceVes,
      };
    }

    // 2. Zero ratio (free / base component)
    if (item.ratio === 0) {
      return {
        ...item,
        price_usd: 0,
        price_ves: 0,
      };
    }

    // 3. Fallback to existing ratio property
    if (matched && typeof item.ratio === 'number') {
      const priceUsd = Number((matched.price_usd * item.ratio).toFixed(2));
      const priceVes = Number((priceUsd * rates.usd_ves).toFixed(2));
      batchCostUsd += priceUsd;
      return {
        ...item,
        ing_id: matched.id,
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
