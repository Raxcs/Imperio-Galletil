import { INITIAL_RECIPES, computeRecipesWithIngredients } from '../services/recipesService';

describe('Recipes Costing and Ingredients Logic', () => {
  it('should verify cookies recipe yield and unit cost match ingredient sums', () => {
    const cookies = INITIAL_RECIPES.find((r) => r.id === 'cookies');
    expect(cookies).toBeDefined();
    if (!cookies) return;

    expect(cookies.batch_yield).toBe(23);

    // Sum of ingredients in USD
    const sumIngredientsUsd = cookies.ingredients.reduce(
      (sum, item) => sum + item.price_usd,
      0
    );
    expect(sumIngredientsUsd).toBeLessThanOrEqual(cookies.batch_cost_usd);
    expect(cookies.batch_cost_usd - sumIngredientsUsd).toBeLessThan(0.5);

    // Pack cost should be batch cost divided by yield
    const calculatedPackCost = cookies.batch_cost_usd / cookies.batch_yield;
    expect(calculatedPackCost).toBeCloseTo(cookies.pack_cost_usd, 2);
  });

  it('should verify brownies recipe yield and unit cost match ingredient sums', () => {
    const brownies = INITIAL_RECIPES.find((r) => r.id === 'brownies');
    expect(brownies).toBeDefined();
    if (!brownies) return;

    expect(brownies.batch_yield).toBe(8);

    const sumIngredientsUsd = brownies.ingredients.reduce(
      (sum, item) => sum + item.price_usd,
      0
    );
    expect(sumIngredientsUsd).toBeCloseTo(brownies.batch_cost_usd, 2);

    const calculatedPackCost = brownies.batch_cost_usd / brownies.batch_yield;
    expect(calculatedPackCost).toBeCloseTo(brownies.pack_cost_usd, 2);
  });

  it('should dynamically update batch and pack costs when an ingredient price changes', () => {
    const customIngredients = [
      {
        id: '1',
        name: 'Harina de trigo',
        presentation: 'Paquete de 1 kg',
        category: ['galletas'],
        price_usd: 2.06, // increased by $1
        price_ves: 1800,
      },
    ];
    const testRates = { usd_ves: 1000, eur_ves: 1100 };
    const recomputed = computeRecipesWithIngredients(INITIAL_RECIPES, customIngredients as any, testRates);
    const updatedCookies = recomputed.find((r) => r.id === 'cookies');

    expect(updatedCookies).toBeDefined();
    if (!updatedCookies) return;

    const originalCookies = INITIAL_RECIPES.find((r) => r.id === 'cookies')!;
    const originalSum = originalCookies.ingredients.reduce((sum: number, item) => sum + item.price_usd, 0);
    expect(updatedCookies.batch_cost_usd).toBeCloseTo(originalSum + 1.0, 2);
    expect(updatedCookies.pack_cost_usd).toBeCloseTo(updatedCookies.batch_cost_usd / 23, 2);
  });

  it('should correctly identify logically deleted recipes without permanent deletion', () => {
    const { isRecipeDeleted } = require('../services/recipesService');
    const normalRecipe = { id: 'r1', title: 'Galletas', subtitle: 'Normal' };
    const markedRecipe = { id: 'r2', title: 'Galletas', subtitle: 'Normal', deleted: true };
    const prefixRecipe = { id: 'r3', title: 'Galletas', subtitle: '__DELETED__Receta de la casa' };
    const cachedDeletedIds = new Set(['r4']);

    expect(isRecipeDeleted(normalRecipe as any)).toBe(false);
    expect(isRecipeDeleted(markedRecipe as any)).toBe(true);
    expect(isRecipeDeleted(prefixRecipe as any)).toBe(true);
    expect(isRecipeDeleted({ id: 'r4', title: 'Torta' } as any, cachedDeletedIds)).toBe(true);
  });
});

