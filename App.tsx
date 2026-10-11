import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  Home as HomeIcon,
  Wallet as WalletIcon,
  BookOpen as BookOpenIcon,
  Package as PackageIcon,
  ChartBar as ChartBarIcon,
} from 'lucide-react-native';
import { THEME } from './src/theme';
import {
  ExchangeRates,
  Ingredient,
  Debt,
  Recipe,
  ProductionLog,
} from './src/types';
import { getExchangeRates, DEFAULT_RATES } from './src/services/exchangeRatesService';
import { fetchIngredients, INITIAL_INGREDIENTS } from './src/services/ingredientsService';
import { fetchDebts, INITIAL_DEBTS } from './src/services/debtsService';
import { fetchRecipes, INITIAL_RECIPES } from './src/services/recipesService';
import { fetchProductionLogs, INITIAL_PRODUCTION_LOGS } from './src/services/productionService';
import { HomeScreen } from './src/screens/HomeScreen';
import { DebtsScreen } from './src/screens/DebtsScreen';
import { RecipesScreen } from './src/screens/RecipesScreen';
import { IngredientsScreen } from './src/screens/IngredientsScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'debts' | 'recipes' | 'ingredients' | 'reports'>('home');
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
  const [debts, setDebts] = useState<Debt[]>(INITIAL_DEBTS);
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [logs, setLogs] = useState<ProductionLog[]>(INITIAL_PRODUCTION_LOGS);

  // Initial load from storage & backend
  useEffect(() => {
    (async () => {
      const loadedRates = await getExchangeRates();
      setRates(loadedRates);

      const [loadedIngredients, loadedDebts, loadedRecipes, loadedLogs] = await Promise.all([
        fetchIngredients(),
        fetchDebts(),
        fetchRecipes(),
        fetchProductionLogs(),
      ]);

      if (loadedIngredients.length > 0) setIngredients(loadedIngredients);
      if (loadedDebts.length > 0) setDebts(loadedDebts);
      if (loadedRecipes.length > 0) setRecipes(loadedRecipes);
      if (loadedLogs.length > 0) setLogs(loadedLogs);
    })();
  }, []);

  const headerSubtitles: Record<string, string> = {
    home: 'Panel de Control y Ventas',
    debts: 'Control de Pagos Pendientes',
    recipes: 'Costos de Produccion y Tandas',
    ingredients: 'Catalogo de Insumos y Costos',
    reports: 'Balance Financiero y Rendimiento',
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* App Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Imperio Galletil</Text>
        <Text style={styles.headerSubtitle}>{headerSubtitles[activeTab]}</Text>
      </View>

      {/* Main Screen Content */}
      <View style={styles.screenContainer}>
        {activeTab === 'home' && (
          <HomeScreen
            rates={rates}
            onRatesUpdated={setRates}
            onNavigateToProduction={() => setActiveTab('reports')}
          />
        )}

        {activeTab === 'debts' && (
          <DebtsScreen
            debts={debts}
            rates={rates}
            onDebtsUpdated={setDebts}
          />
        )}

        {activeTab === 'recipes' && (
          <RecipesScreen
            recipes={recipes}
            rates={rates}
            onRecipesUpdated={setRecipes}
          />
        )}

        {activeTab === 'ingredients' && (
          <IngredientsScreen
            ingredients={ingredients}
            rates={rates}
            onIngredientsUpdated={setIngredients}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsScreen
            logs={logs}
            rates={rates}
            onLogsUpdated={setLogs}
          />
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        {/* Tab 1: Inicio */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <HomeIcon
            size={20}
            color={activeTab === 'home' ? THEME.colors.accent : THEME.colors.textMuted}
            strokeWidth={activeTab === 'home' ? 2.5 : 2}
          />
          <Text
            style={[
              styles.navLabel,
              activeTab === 'home' && styles.navLabelActive,
            ]}
          >
            Inicio
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Por Cobrar */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('debts')}
          activeOpacity={0.7}
        >
          <WalletIcon
            size={20}
            color={activeTab === 'debts' ? THEME.colors.accent : THEME.colors.textMuted}
            strokeWidth={activeTab === 'debts' ? 2.5 : 2}
          />
          <Text
            style={[
              styles.navLabel,
              activeTab === 'debts' && styles.navLabelActive,
            ]}
          >
            Por Cobrar
          </Text>
        </TouchableOpacity>

        {/* Tab 3: Recetas */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('recipes')}
          activeOpacity={0.7}
        >
          <BookOpenIcon
            size={20}
            color={activeTab === 'recipes' ? THEME.colors.accent : THEME.colors.textMuted}
            strokeWidth={activeTab === 'recipes' ? 2.5 : 2}
          />
          <Text
            style={[
              styles.navLabel,
              activeTab === 'recipes' && styles.navLabelActive,
            ]}
          >
            Recetas
          </Text>
        </TouchableOpacity>

        {/* Tab 4: Insumos */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('ingredients')}
          activeOpacity={0.7}
        >
          <PackageIcon
            size={20}
            color={activeTab === 'ingredients' ? THEME.colors.accent : THEME.colors.textMuted}
            strokeWidth={activeTab === 'ingredients' ? 2.5 : 2}
          />
          <Text
            style={[
              styles.navLabel,
              activeTab === 'ingredients' && styles.navLabelActive,
            ]}
          >
            Insumos
          </Text>
        </TouchableOpacity>

        {/* Tab 5: Reportes */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('reports')}
          activeOpacity={0.7}
        >
          <ChartBarIcon
            size={20}
            color={activeTab === 'reports' ? THEME.colors.accent : THEME.colors.textMuted}
            strokeWidth={activeTab === 'reports' ? 2.5 : 2}
          />
          <Text
            style={[
              styles.navLabel,
              activeTab === 'reports' && styles.navLabelActive,
            ]}
          >
            Reportes
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    backgroundColor: THEME.colors.card,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.accent,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.card,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.colors.textMuted,
  },
  navLabelActive: {
    color: THEME.colors.accent,
    fontWeight: '800',
  },
});
