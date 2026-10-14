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
  ScrollView,
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
  Download,
  ShieldCheck,
  AlertCircle,
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
import { getCachedIngredients, INITIAL_INGREDIENTS, fetchIngredients } from './src/services/ingredientsService';
import { getCachedDebts, INITIAL_DEBTS, fetchDebts } from './src/services/debtsService';
import { getCachedRecipes, INITIAL_RECIPES, computeRecipesWithIngredients, fetchRecipes } from './src/services/recipesService';
import { getCachedProductionLogs, INITIAL_PRODUCTION_LOGS, fetchProductionLogs } from './src/services/productionService';
import {
  checkForAppUpdate,
  openAppUpdateDownload,
  downloadAndInstallApk,
  cancelActiveDownload,
  AppUpdateInfo,
} from './src/services/updateService';
import { CookieBackground } from './src/components/CookieBackground';
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
  const [bannerDismissedVersion, setBannerDismissedVersion] = useState<string | null>(null);
  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState(false);
  const [showInAppBanner, setShowInAppBanner] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const handleStartUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;
    setDownloadingUpdate(true);
    setDownloadProgress(0);
    setDownloadError(null);
    setDownloadStatusText('Conectando con el servidor...');

    const result = await downloadAndInstallApk(updateInfo.downloadUrl, (ratio, written, total) => {
      setDownloadProgress(ratio);
      if (ratio >= 1) {
        setDownloadStatusText('Iniciando instalador nativo de Android...');
      } else {
        const percent = Math.round(ratio * 100);
        let detail = `${percent}%`;
        if (total && total > 0 && written) {
          const writtenMb = (written / (1024 * 1024)).toFixed(1);
          const totalMb = (total / (1024 * 1024)).toFixed(1);
          detail = `${percent}% (${writtenMb} MB de ${totalMb} MB)`;
        }
        setDownloadStatusText(`Descargando actualizacion: ${detail}`);
      }
    });

    if (result.cancelled) {
      setDownloadingUpdate(false);
      setDownloadProgress(0);
      setDownloadStatusText('');
      return;
    }

    if (!result.success) {
      setDownloadingUpdate(false);
      setDownloadError(result.error || 'No fue posible completar la instalacion nativa.');
    } else {
      setDownloadingUpdate(false);
    }
  };

  const handleCancelUpdate = async () => {
    await cancelActiveDownload();
    setDownloadingUpdate(false);
    setDownloadProgress(0);
    setDownloadStatusText('');
    setDownloadError(null);
  };

  const handleDismissModal = () => {
    if (updateInfo?.version && !downloadingUpdate) {
      setDismissedVersion(updateInfo.version);
    }
    setIsUpdateModalVisible(false);
  };

  const handleDismissBanner = () => {
    if (updateInfo?.version) {
      setBannerDismissedVersion(updateInfo.version);
    }
    setShowInAppBanner(false);
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
        if (Array.isArray(cachedDebts)) setDebts(cachedDebts);
        if (cachedIngredients && cachedIngredients.length > 0) setIngredients(cachedIngredients);
        if (cachedRecipes && cachedRecipes.length > 0) setRecipes(cachedRecipes);
        if (cachedLogs && cachedLogs.length > 0) setLogs(cachedLogs);
      } catch (err) {
        console.warn('Error hydrating local cache on startup', err);
      }

      // 2. Refresh official market exchange rates in background
      syncBcvRates()
        .then((bcvSync) => {
          if (isMounted && bcvSync.updated) {
            setRates(bcvSync.rates);
          }
        })
        .catch(() => {});

      // 3. Sync all data entities with Supabase in background
      Promise.allSettled([
        fetchDebts(),
        fetchIngredients(),
        fetchRecipes(),
        fetchProductionLogs(),
      ]).then(([debtsRes, ingRes, recRes, logRes]) => {
        if (!isMounted) return;
        if (debtsRes.status === 'fulfilled' && Array.isArray(debtsRes.value)) {
          setDebts(debtsRes.value);
        }
        if (ingRes.status === 'fulfilled' && Array.isArray(ingRes.value) && ingRes.value.length > 0) {
          setIngredients(ingRes.value);
        }
        if (recRes.status === 'fulfilled' && Array.isArray(recRes.value) && recRes.value.length > 0) {
          setRecipes(recRes.value);
        }
        if (logRes.status === 'fulfilled' && Array.isArray(logRes.value)) {
          setLogs(logRes.value);
        }
      }).catch(() => {});
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSyncAllCloudData = async () => {
    try {
      const [newRatesResult, newDebts, newIngredients, newRecipes, newLogs] = await Promise.allSettled([
        syncBcvRates(),
        fetchDebts(),
        fetchIngredients(),
        fetchRecipes(),
        fetchProductionLogs(),
      ]);

      if (newRatesResult.status === 'fulfilled' && newRatesResult.value.updated) {
        setRates(newRatesResult.value.rates);
      }
      if (newDebts.status === 'fulfilled' && Array.isArray(newDebts.value)) {
        setDebts(newDebts.value);
      }
      if (newIngredients.status === 'fulfilled' && Array.isArray(newIngredients.value) && newIngredients.value.length > 0) {
        setIngredients(newIngredients.value);
      }
      if (newRecipes.status === 'fulfilled' && Array.isArray(newRecipes.value) && newRecipes.value.length > 0) {
        setRecipes(newRecipes.value);
      }
      if (newLogs.status === 'fulfilled' && Array.isArray(newLogs.value)) {
        setLogs(newLogs.value);
      }
    } catch (err) {
      console.warn('Error syncing cloud data', err);
    }
  };

  // Update check runner
  const runUpdateCheck = async (triggerPopup: boolean = false) => {
    try {
      const update = await checkForAppUpdate();
      if (update.hasUpdate) {
        setUpdateInfo(update);
        if (update.version !== bannerDismissedVersion) {
          setShowInAppBanner(true);
        }
        if (triggerPopup && update.version !== dismissedVersion) {
          setIsUpdateModalVisible(true);
        }
      }
    } catch {
      // Silently handle update check failure
    }
  };

  // Continuous update detection
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
  }, [dismissedVersion, bannerDismissedVersion]);

  const safeTopPadding = Platform.OS === 'android'
    ? Math.max(insets.top, StatusBar.currentHeight || 24) + 6
    : Math.max(insets.top, 14);

  return (
    <View style={[styles.safeArea, { paddingTop: safeTopPadding }]}>
      {/* Repeating crash-proof cookie tile background */}
      <CookieBackground />
      <StatusBar barStyle="light-content" backgroundColor={THEME.colors.bg} translucent />

      {/* In-App Update Notification Banner */}
      {updateInfo && updateInfo.hasUpdate && showInAppBanner && (
        <View style={styles.inAppBannerContainer}>
          {downloadingUpdate ? (
            <View style={styles.inAppBannerRow}>
              <TouchableOpacity
                style={styles.inAppBannerLeft}
                onPress={() => setIsUpdateModalVisible(true)}
                activeOpacity={0.85}
              >
                <View style={styles.inAppBannerBadge}>
                  <Download size={14} color={THEME.colors.bg} strokeWidth={2.5} />
                </View>
                <View style={styles.inAppBannerTexts}>
                  <Text style={styles.inAppBannerTitle}>
                    Descargando actualizacion en segundo plano
                  </Text>
                  <Text style={styles.inAppBannerSub} numberOfLines={1}>
                    {downloadStatusText || `${Math.round(downloadProgress * 100)}% completado`}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.inAppBannerActions}>
                <TouchableOpacity
                  style={styles.inAppBannerBtn}
                  onPress={() => setIsUpdateModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.inAppBannerBtnText}>Ver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inAppBannerClose}
                  onPress={handleCancelUpdate}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={16} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.inAppBannerRow}>
              <TouchableOpacity
                style={styles.inAppBannerLeft}
                onPress={() => setIsUpdateModalVisible(true)}
                activeOpacity={0.85}
              >
                <View style={styles.inAppBannerBadge}>
                  <Sparkles size={14} color={THEME.colors.bg} strokeWidth={2.5} />
                </View>
                <View style={styles.inAppBannerTexts}>
                  <Text style={styles.inAppBannerTitle}>
                    Nueva actualizacion disponible
                  </Text>
                  <Text style={styles.inAppBannerSub} numberOfLines={1}>
                    {updateInfo.version || 'Version reciente lista para instalar'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.inAppBannerActions}>
                <TouchableOpacity
                  style={styles.inAppBannerBtn}
                  onPress={() => setIsUpdateModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.inAppBannerBtnText}>Instalar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inAppBannerClose}
                  onPress={handleDismissBanner}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={16} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {downloadingUpdate && (
            <View style={styles.inAppBannerMiniTrack}>
              <View style={[styles.inAppBannerMiniFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
            </View>
          )}
        </View>
      )}

      {/* Main Screen Content Area */}
      <View style={styles.screenContainer}>
        {activeTab === 'home' && (
          <HomeScreen
            rates={rates}
            debts={debts}
            logs={logs}
            onRatesUpdated={setRates}
            onNavigateToProduction={() => setActiveTab('reports')}
            onNavigateToDebts={() => setActiveTab('debts')}
            onSyncAll={handleSyncAllCloudData}
          />
        )}

        {activeTab === 'debts' && (
          <DebtsScreen
            debts={debts}
            rates={rates}
            recipes={computedRecipes}
            onDebtsUpdated={setDebts}
          />
        )}

        {activeTab === 'recipes' && (
          <RecipesScreen
            recipes={computedRecipes}
            rates={rates}
            ingredients={ingredients}
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
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom > 0 ? insets.bottom + 2 : 10 }]}>
        {/* Tab 1: Inicio */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <HomeIcon
            size={20}
            color={activeTab === 'home' ? THEME.colors.accent : THEME.colors.textMuted}
            strokeWidth={activeTab === 'home' ? 2.4 : 1.8}
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
            strokeWidth={activeTab === 'debts' ? 2.4 : 1.8}
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
            strokeWidth={activeTab === 'recipes' ? 2.4 : 1.8}
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
            strokeWidth={activeTab === 'ingredients' ? 2.4 : 1.8}
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
            strokeWidth={activeTab === 'reports' ? 2.4 : 1.8}
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

      {/* Modal de Actualizacion Directa (Boveda Bottom Sheet) */}
      {updateInfo && updateInfo.hasUpdate && isUpdateModalVisible && (
        <Modal
          visible={isUpdateModalVisible}
          transparent
          animationType="slide"
          onRequestClose={handleDismissModal}
        >
          <View style={styles.sheetOverlay}>
            <TouchableOpacity
              style={styles.sheetBackdropDismiss}
              activeOpacity={1}
              onPress={handleDismissModal}
            />
            <View style={styles.updateSheetBox}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.updateModalBadge}>ACTUALIZACION OFICIAL DISPONIBLE</Text>
                  <Text style={styles.updateModalTitle}>{updateInfo.version || 'Nueva Version'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={handleDismissModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <X size={16} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.dataSafeBanner}>
                <ShieldCheck size={18} color={THEME.colors.accent} />
                <Text style={styles.dataSafeBannerText}>
                  Datos locales blindados: Tus recetas, insumos y cuentas por cobrar permanecen intactos.
                </Text>
              </View>

              <Text style={styles.updateModalDesc}>
                Se ha detectado una nueva version optimizada para el sistema de Imperio Galletil.
              </Text>

              {!!updateInfo.changelog && (
                <View style={styles.changelogBox}>
                  <Text style={styles.changelogLabel}>Novedades de esta version:</Text>
                  <ScrollView
                    style={styles.changelogScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={true}
                  >
                    <Text style={styles.changelogText}>
                      {updateInfo.changelog}
                    </Text>
                  </ScrollView>
                </View>
              )}

              {downloadingUpdate ? (
                <View style={styles.downloadProgressSection}>
                  <View
                    style={styles.downloadProgressBarTrack}
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: Math.round(downloadProgress * 100) }}
                  >
                    <View style={[styles.downloadProgressBarFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
                  </View>
                  <View style={styles.downloadProgressTextRow}>
                    <Text style={styles.downloadStatusText}>{downloadStatusText}</Text>
                    <Text style={styles.downloadPercentText}>{Math.round(downloadProgress * 100)}%</Text>
                  </View>

                  <View style={styles.updateModalButtons}>
                    <TouchableOpacity
                      style={styles.btnBackgroundUpdate}
                      onPress={handleDismissModal}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnBackgroundUpdateText}>Segundo Plano</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnCancelUpdate}
                      onPress={handleCancelUpdate}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnCancelUpdateText}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : downloadError ? (
                <View style={styles.downloadErrorSection}>
                  <View style={styles.downloadErrorRow}>
                    <AlertCircle size={18} color={THEME.colors.danger} />
                    <Text style={styles.downloadErrorText}>{downloadError}</Text>
                  </View>
                  <View style={styles.updateModalButtons}>
                    <TouchableOpacity
                      style={styles.btnDismissUpdate}
                      onPress={handleDismissModal}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnDismissUpdateText}>Cerrar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnApplyUpdate}
                      onPress={handleStartUpdate}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnApplyUpdateText}>Reintentar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.updateModalButtons}>
                  <TouchableOpacity
                    style={styles.btnDismissUpdate}
                    onPress={handleDismissModal}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnDismissUpdateText}>Posponer</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnApplyUpdate}
                    onPress={handleStartUpdate}
                    activeOpacity={0.8}
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

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error capturado en RootErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Imperio Galletil</Text>
          <Text style={styles.errorSubtitle}>Ocurrio un problema al iniciar</Text>
          <Text style={styles.errorDetail} numberOfLines={4}>
            {this.state.error?.message || 'Error no especificado'}
          </Text>
          <TouchableOpacity style={styles.errorButton} onPress={this.handleReload} activeOpacity={0.8}>
            <Text style={styles.errorButtonText}>Reiniciar Aplicacion</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <MainAppContent />
      </RootErrorBoundary>
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
    backgroundColor: 'transparent',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: THEME.colors.accent,
  },
  errorSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  errorDetail: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorButton: {
    marginTop: 12,
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
  },
  errorButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090b',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(9, 9, 11, 0.95)',
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: THEME.colors.textMuted,
    letterSpacing: -0.1,
  },
  navLabelActive: {
    color: THEME.colors.accent,
    fontWeight: '700',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetBackdropDismiss: {
    ...StyleSheet.absoluteFill,
  },
  updateSheetBox: {
    backgroundColor: THEME.colors.card,
    borderTopLeftRadius: THEME.radius.sheet,
    borderTopRightRadius: THEME.radius.sheet,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 24,
    gap: 12,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  sheetCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateModalBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.5,
  },
  updateModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  dataSafeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.colors.accentBg,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: THEME.radius.md,
    padding: 10,
  },
  dataSafeBannerText: {
    flex: 1,
    fontSize: 11,
    color: THEME.colors.accentLight,
    lineHeight: 16,
    fontWeight: '600',
  },
  updateModalDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  changelogBox: {
    backgroundColor: THEME.colors.bg,
    borderRadius: THEME.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  changelogLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accentLight,
    marginBottom: 4,
  },
  changelogScroll: {
    maxHeight: 120,
  },
  changelogText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  updateModalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  btnDismissUpdate: {
    flex: 1,
    minHeight: 46,
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDismissUpdateText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  btnApplyUpdate: {
    flex: 1,
    minHeight: 46,
    backgroundColor: THEME.colors.accent,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnApplyUpdateText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.bg,
  },
  btnBackgroundUpdate: {
    flex: 1,
    minHeight: 46,
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBackgroundUpdateText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  btnCancelUpdate: {
    minHeight: 46,
    paddingHorizontal: 16,
    backgroundColor: THEME.colors.dangerBg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelUpdateText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.danger,
  },
  downloadProgressSection: {
    marginTop: 4,
    gap: 8,
  },
  downloadProgressBarTrack: {
    height: 8,
    backgroundColor: THEME.colors.bg,
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
    flex: 1,
    marginRight: 8,
  },
  downloadPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accent,
  },
  downloadErrorSection: {
    marginTop: 4,
    gap: 8,
  },
  downloadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.colors.dangerBg,
    borderRadius: THEME.radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  downloadErrorText: {
    fontSize: 11,
    color: THEME.colors.danger,
    flex: 1,
    lineHeight: 16,
  },
  inAppBannerContainer: {
    backgroundColor: THEME.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorderHighlight,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inAppBannerRow: {
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
    gap: 6,
  },
  inAppBannerBtn: {
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: THEME.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inAppBannerBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.bg,
  },
  inAppBannerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inAppBannerMiniTrack: {
    height: 3,
    backgroundColor: THEME.colors.bg,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  inAppBannerMiniFill: {
    height: '100%',
    backgroundColor: THEME.colors.accent,
    borderRadius: 2,
  },
});
