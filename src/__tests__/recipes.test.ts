import { INITIAL_RECIPES } from '../services/recipesService';

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

  it('should have 6 steps in each recipe preparation process', () => {
    INITIAL_RECIPES.forEach((recipe) => {
      const lines = recipe.process.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(6);
      expect(lines[0]).toMatch(/^1\./);
    });
  });
});
