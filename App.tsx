import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
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
import { getExchangeRates, DEFAULT_RATES, syncBcvRates } from './src/services/exchangeRatesService';
import { fetchIngredients, INITIAL_INGREDIENTS } from './src/services/ingredientsService';
import { fetchDebts, INITIAL_DEBTS } from './src/services/debtsService';
import { fetchRecipes, INITIAL_RECIPES, computeRecipesWithIngredients } from './src/services/recipesService';
import { fetchProductionLogs, INITIAL_PRODUCTION_LOGS } from './src/services/productionService';
import {
  checkForAppUpdate,
  openAppUpdateDownload,
  AppUpdateInfo,
} from './src/services/updateService';
import { HomeScreen } from './src/screens/HomeScreen';
import { DebtsScreen } from './src/screens/DebtsScreen';
import { RecipesScreen } from './src/screens/RecipesScreen';
import { IngredientsScreen } from './src/screens/IngredientsScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';

function MainAppContent() {
  const [activeTab, setActiveTab] = useState<'home' | 'debts' | 'recipes' | 'ingredients' | 'reports'>('home');
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
  const [debts, setDebts] = useState<Debt[]>(INITIAL_DEBTS);
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [logs, setLogs] = useState<ProductionLog[]>(INITIAL_PRODUCTION_LOGS);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const insets = useSafeAreaInsets();

  // Dynamic real-time calculation connecting ingredients & exchange rates to all recipes
  const computedRecipes = useMemo(() => {
    return computeRecipesWithIngredients(recipes, ingredients, rates);
  }, [recipes, ingredients, rates]);

  // Initial load from storage, backend & BCV official synchronization
  useEffect(() => {
    (async () => {
      const loadedRates = await getExchangeRates();
      setRates(loadedRates);

      const [loadedIngredients, loadedDebts, loadedRecipes, loadedLogs, update, bcvSync] = await Promise.all([
        fetchIngredients(),
        fetchDebts(),
        fetchRecipes(),
        fetchProductionLogs(),
        checkForAppUpdate(),
        syncBcvRates(),
      ]);

      if (bcvSync.updated) setRates(bcvSync.rates);
      if (loadedIngredients.length > 0) setIngredients(loadedIngredients);
      if (loadedDebts.length > 0) setDebts(loadedDebts);
      if (loadedRecipes.length > 0) setRecipes(loadedRecipes);
      if (loadedLogs.length > 0) setLogs(loadedLogs);
      if (update.hasUpdate) setUpdateInfo(update);
    })();
  }, []);

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

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
            recipes={computedRecipes}
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
            recipes={computedRecipes}
            onLogsUpdated={setLogs}
          />
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom > 0 ? insets.bottom + 4 : 8 }]}>
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

      {/* Modal de Actualizacion Directa */}
      {updateInfo && updateInfo.hasUpdate && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setUpdateInfo(null)}
        >
          <View style={styles.updateModalOverlay}>
            <View style={styles.updateModalBox}>
              <View style={styles.updateModalHeader}>
                <Text style={styles.updateModalBadge}>ACTUALIZACION DISPONIBLE</Text>
                <Text style={styles.updateModalTitle}>{updateInfo.version}</Text>
              </View>

              <Text style={styles.updateModalDesc}>
                Se ha detectado una nueva version de Imperio Galletil en GitHub. Puedes actualizar directamente sin perder tus datos locales.
              </Text>

              {!!updateInfo.changelog && (
                <View style={styles.changelogBox}>
                  <Text style={styles.changelogLabel}>Novedades:</Text>
                  <Text style={styles.changelogText} numberOfLines={3}>
                    {updateInfo.changelog}
                  </Text>
                </View>
              )}

              <View style={styles.updateModalButtons}>
                <TouchableOpacity
                  style={styles.btnDismissUpdate}
                  onPress={() => setUpdateInfo(null)}
                >
                  <Text style={styles.btnDismissUpdateText}>Continuar a la App</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnApplyUpdate}
                  onPress={() => {
                    if (updateInfo.downloadUrl) {
                      openAppUpdateDownload(updateInfo.downloadUrl);
                    }
                  }}
                >
                  <Text style={styles.btnApplyUpdateText}>Actualizar Ahora</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainAppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
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
    paddingTop: 8,
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
  updateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  updateModalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.colors.accent,
    gap: 12,
  },
  updateModalHeader: {},
  updateModalBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.5,
  },
  updateModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  updateModalDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  changelogBox: {
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  changelogLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accentLight,
    marginBottom: 2,
  },
  changelogText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  updateModalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btnDismissUpdate: {
    flex: 1,
    backgroundColor: '#0c0a09',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  btnDismissUpdateText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  btnApplyUpdate: {
    flex: 1,
    backgroundColor: THEME.colors.accent,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  btnApplyUpdateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0c0a09',
  },
});
