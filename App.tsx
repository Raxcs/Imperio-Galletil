import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
  Alert,
  Platform,
  AppState,
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
  Sparkles,
  X,
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
import { fetchIngredients, getCachedIngredients, INITIAL_INGREDIENTS } from './src/services/ingredientsService';
import { fetchDebts, getCachedDebts, INITIAL_DEBTS } from './src/services/debtsService';
import { fetchRecipes, getCachedRecipes, INITIAL_RECIPES, computeRecipesWithIngredients } from './src/services/recipesService';
import { fetchProductionLogs, getCachedProductionLogs, INITIAL_PRODUCTION_LOGS } from './src/services/productionService';
import {
  checkForAppUpdate,
  openAppUpdateDownload,
  downloadAndInstallApk,
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
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState(false);
  const [showInAppBanner, setShowInAppBanner] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState('');
  const insets = useSafeAreaInsets();

  const handleStartUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;
    setDownloadingUpdate(true);
    setDownloadProgress(0);
    setDownloadStatusText('Conectando con el servidor...');

    const result = await downloadAndInstallApk(updateInfo.downloadUrl, (ratio) => {
      setDownloadProgress(ratio);
      if (ratio >= 1) {
        setDownloadStatusText('Iniciando instalador nativo de Android...');
      } else {
        setDownloadStatusText(`Descargando actualizacion: ${Math.round(ratio * 100)}%`);
      }
    });

    if (!result.success) {
      setDownloadingUpdate(false);
      Alert.alert(
        'Aviso de Descarga',
        'No fue posible iniciar la instalacion nativa directa. ¿Deseas descargar el instalador desde el navegador?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Abrir Navegador',
            onPress: () => updateInfo.downloadUrl && openAppUpdateDownload(updateInfo.downloadUrl),
          },
        ]
      );
    }
  };

  // Dynamic real-time calculation connecting ingredients & exchange rates to all recipes
  const computedRecipes = useMemo(() => {
    return computeRecipesWithIngredients(recipes, ingredients, rates);
  }, [recipes, ingredients, rates]);

  // Initial load: 1. Instant Cache Hydration (<5ms), 2. Decoupled Background Cloud Sync
  useEffect(() => {
    let isMounted = true;

    (async () => {
      // 1. Immediately hydrate state from local storage cache
      try {
        const [cachedRates, cachedDebts, cachedIngredients, cachedRecipes, cachedLogs] = await Promise.all([
          getExchangeRates(),
          getCachedDebts(),
          getCachedIngredients(),
          getCachedRecipes(),
          getCachedProductionLogs(),
        ]);

        if (!isMounted) return;
        if (cachedRates) setRates(cachedRates);
        if (cachedDebts && cachedDebts.length > 0) setDebts(cachedDebts);
        if (cachedIngredients && cachedIngredients.length > 0) setIngredients(cachedIngredients);
        if (cachedRecipes && cachedRecipes.length > 0) setRecipes(cachedRecipes);
        if (cachedLogs && cachedLogs.length > 0) setLogs(cachedLogs);
      } catch (err) {
        console.warn('Error hydrating local cache on startup', err);
      }

      // 2. Decoupled background cloud sync (each finishes on its own without blocking others)
      fetchDebts()
        .then((freshDebts) => {
          if (isMounted && freshDebts && freshDebts.length > 0) {
            setDebts(freshDebts);
          }
        })
        .catch(() => {});

      fetchIngredients()
        .then((freshIngs) => {
          if (isMounted && freshIngs && freshIngs.length > 0) {
            setIngredients(freshIngs);
          }
        })
        .catch(() => {});

      fetchRecipes()
        .then((freshRecipes) => {
          if (isMounted && freshRecipes && freshRecipes.length > 0) {
            setRecipes(freshRecipes);
          }
        })
        .catch(() => {});

      fetchProductionLogs()
        .then((freshLogs) => {
          if (isMounted && freshLogs && freshLogs.length > 0) {
            setLogs(freshLogs);
          }
        })
        .catch(() => {});

      syncBcvRates()
        .then((bcvSync) => {
          if (isMounted && bcvSync.updated) {
            setRates(bcvSync.rates);
          }
        })
        .catch(() => {});
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update check runner
  const runUpdateCheck = async (triggerPopup: boolean = false) => {
    try {
      const update = await checkForAppUpdate();
      if (update.hasUpdate) {
        setUpdateInfo(update);
        setShowInAppBanner(true);
        if (triggerPopup && update.version !== dismissedVersion) {
          setIsUpdateModalVisible(true);
        }
      }
    } catch (err) {
      // Silently handle update check failure
    }
  };

  // Continuous update detection: startup delay, periodic 45s interval, and foreground AppState listener
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      runUpdateCheck(true);
    }, 2000);

    const intervalTimer = setInterval(() => {
      runUpdateCheck(false);
    }, 45000);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        runUpdateCheck(true);
      }
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      subscription.remove();
    };
  }, [dismissedVersion]);

  const safeTopPadding = Platform.OS === 'android'
    ? Math.max(insets.top, StatusBar.currentHeight || 24) + 8
    : Math.max(insets.top, 16);

  return (
    <View style={[styles.safeArea, { paddingTop: safeTopPadding }]}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* Notificacion In-App de Actualizacion */}
      {updateInfo && updateInfo.hasUpdate && showInAppBanner && (
        <View style={styles.inAppBannerContainer}>
          <TouchableOpacity
            style={styles.inAppBannerTouch}
            onPress={() => setIsUpdateModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.inAppBannerLeft}>
              <View style={styles.inAppBannerBadge}>
                <Sparkles size={14} color="#0c0a09" strokeWidth={2.5} />
              </View>
              <View style={styles.inAppBannerTexts}>
                <Text style={styles.inAppBannerTitle}>
                  Nueva actualizacion disponible
                </Text>
                <Text style={styles.inAppBannerSub} numberOfLines={1}>
                  {updateInfo.version || 'Version reciente lista para instalar'}
                </Text>
              </View>
            </View>

            <View style={styles.inAppBannerActions}>
              <TouchableOpacity
                style={styles.inAppBannerBtn}
                onPress={() => setIsUpdateModalVisible(true)}
              >
                <Text style={styles.inAppBannerBtnText}>Instalar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inAppBannerClose}
                onPress={() => setShowInAppBanner(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={THEME.colors.textMuted} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}

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
      {updateInfo && updateInfo.hasUpdate && isUpdateModalVisible && (
        <Modal
          visible={isUpdateModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsUpdateModalVisible(false)}
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

              {downloadingUpdate ? (
                <View style={styles.downloadProgressSection}>
                  <View style={styles.downloadProgressBarTrack}>
                    <View style={[styles.downloadProgressBarFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
                  </View>
                  <View style={styles.downloadProgressTextRow}>
                    <Text style={styles.downloadStatusText}>{downloadStatusText}</Text>
                    <Text style={styles.downloadPercentText}>{Math.round(downloadProgress * 100)}%</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.updateModalButtons}>
                  <TouchableOpacity
                    style={styles.btnDismissUpdate}
                    onPress={() => {
                      if (updateInfo?.version) {
                        setDismissedVersion(updateInfo.version);
                      }
                      setIsUpdateModalVisible(false);
                    }}
                  >
                    <Text style={styles.btnDismissUpdateText}>Continuar a la App</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnApplyUpdate}
                    onPress={handleStartUpdate}
                  >
                    <Text style={styles.btnApplyUpdateText}>Actualizar Ahora</Text>
                  </TouchableOpacity>
                </View>
              )}
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
  downloadProgressSection: {
    marginTop: 6,
    gap: 8,
  },
  downloadProgressBarTrack: {
    height: 8,
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  downloadProgressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.full,
  },
  downloadProgressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadStatusText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  downloadPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accent,
  },
  inAppBannerContainer: {
    backgroundColor: '#161413',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inAppBannerTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inAppBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  inAppBannerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inAppBannerTexts: {
    flex: 1,
  },
  inAppBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accentLight,
  },
  inAppBannerSub: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  inAppBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inAppBannerBtn: {
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.radius.sm,
  },
  inAppBannerBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0c0a09',
  },
  inAppBannerClose: {
    padding: 2,
  },
});
