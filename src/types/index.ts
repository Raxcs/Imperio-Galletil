export interface Ingredient {
  id: string;
  name: string;
  presentation: string;
  category: string[];
  price_usd: number;
  price_ves: number;
  selected?: boolean;
  created_at?: string;
}

export interface Debt {
  id: string;
  name: string;
  amount: number;
  debt_date: string;
  note?: string;
  paid: boolean;
  paid_date?: string | null;
  created_at?: string;
}

export interface ProductionLog {
  id: string;
  name: string;
  qty: number;
  price_ves: number;
  cost_ves: number;
  created_at?: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  price_ves: number;
  price_usd: number;
}

export interface Recipe {
  id: string;
  title: string;
  subtitle: string;
  batch_yield: number;
  batch_cost_usd: number;
  pack_cost_usd: number;
  process: string;
  ingredients: RecipeIngredient[];
  created_at?: string;
}

export interface ExchangeRates {
  usd_ves: number;
  eur_ves: number;
}
