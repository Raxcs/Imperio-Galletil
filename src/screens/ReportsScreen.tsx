import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { Plus, Pencil, Undo2, X } from 'lucide-react-native';
import { THEME } from '../theme';
import { ProductionLog, ExchangeRates, Recipe } from '../types';
import { SwipeableRow } from '../components/SwipeableRow';
import {
  fetchProductionLogs,
  addProductionLogInBackend,
  updateProductionLogInBackend,
  deleteProductionLogInBackend,
  restoreProductionLogInBackend,
  setCachedProductionLogs,
  isProductionLogDeleted,
  isLegacySeedLog,
} from '../services/productionService';
import { generateId } from '../lib/sync';

interface ReportsScreenProps {
  logs: ProductionLog[];
  rates: ExchangeRates;
  recipes: Recipe[];
  onLogsUpdated: (logs: ProductionLog[]) => void;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  logs,
  rates,
  recipes,
  onLogsUpdated,
}) => {
  const initialRecipe = recipes[0];
  const initialCost = initialRecipe ? Number((initialRecipe.pack_cost_usd * rates.usd_ves).toFixed(2)) : 286.93;

  const [isAddFormVisible, setIsAddFormVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit log modal state
  const [editingLog, setEditingLog] = useState<ProductionLog | null>(null);
  const [editLogName, setEditLogName] = useState('');
  const [editLogQtyStr, setEditLogQtyStr] = useState('');
  const [editLogPriceStr, setEditLogPriceStr] = useState('');
  const [editLogCostStr, setEditLogCostStr] = useState('');

  // Undo (Deshacer) state - strictly 5 seconds
  const [deletedLogToUndo, setDeletedLogToUndo] = useState<ProductionLog | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await fetchProductionLogs();
      if (fresh) {
        onLogsUpdated(fresh);
      }
    } catch (err) {
      console.warn('Error refreshing production logs', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [prodName, setProdName] = useState(initialRecipe?.title || 'Galletas Clasicas');
  const [prodQtyStr, setProdQtyStr] = useState(initialRecipe?.batch_yield ? initialRecipe.batch_yield.toString() : '23');
  const [prodPriceStr, setProdPriceStr] = useState('1000');
  const [prodCost, setProdCost] = useState(initialCost);

  // Totals - only active, non-deleted, non-seed production logs
  let totalGrossVes = 0;
  let totalReinvestVes = 0;

  const activeLogs = logs.filter((item) => !isProductionLogDeleted(item) && !isLegacySeedLog(item));

  activeLogs.forEach((item) => {
    const itemGross = item.qty * item.price_ves;
    const itemCost = item.qty * item.cost_ves;
    totalGrossVes += itemGross;
    totalReinvestVes += itemCost;
  });

  const netProfitVes = Math.max(0, totalGrossVes - totalReinvestVes);
  const netProfitUsd = rates.usd_ves > 0 ? netProfitVes / rates.usd_ves : 0;
  const grossUsd = rates.usd_ves > 0 ? totalGrossVes / rates.usd_ves : 0;
  const reinvestUsd = rates.usd_ves > 0 ? totalReinvestVes / rates.usd_ves : 0;

  const margin = totalGrossVes > 0
    ? ((netProfitVes / totalGrossVes) * 100).toFixed(1)
    : '0';

  const previewQty = parseInt(prodQtyStr, 10) || 0;
  const previewPrice = parseFloat(prodPriceStr) || 0;
  const previewGrossVes = previewQty * previewPrice;
  const previewCostVes = previewQty * prodCost;
  const previewNetVes = Math.max(0, previewGrossVes - previewCostVes);

  const handleSelectRecipePreset = (recipe: Recipe) => {
    setProdName(recipe.title);
    const unitCost = Number((recipe.pack_cost_usd * rates.usd_ves).toFixed(2));
    setProdCost(unitCost);
    setProdQtyStr(recipe.batch_yield.toString());
    const lower = recipe.title.toLowerCase();
    if (lower.includes('brownie')) {
      setProdPriceStr('2500');
    } else {
      setProdPriceStr('1000');
    }
  };

  const handleAddProduction = async () => {
    if (isSubmitting) return;

    const trimmed = prodName.trim();
    const qty = parseInt(prodQtyStr, 10) || 0;
    const price = parseFloat(prodPriceStr) || 0;

    if (!trimmed || qty <= 0 || price <= 0) {
      Alert.alert('Datos requeridos', 'Por favor ingresa un nombre, cantidad y precio valido.');
      return;
    }

    setIsSubmitting(true);

    const matchedRecipe = recipes.find(
      (r) => r.title.toLowerCase().trim() === trimmed.toLowerCase() ||
             trimmed.toLowerCase().includes(r.title.toLowerCase().trim())
    );

    const calculatedCost = matchedRecipe
      ? Number((matchedRecipe.pack_cost_usd * rates.usd_ves).toFixed(2))
      : prodCost;

    const newLogId = generateId();
    const newLog: ProductionLog = {
      id: newLogId,
      name: trimmed,
      qty,
      price_ves: price,
      cost_ves: calculatedCost,
      created_at: new Date().toISOString(),
    };

    // Optimistic UI and cache update immediately (<1ms)
    const updated = [newLog, ...logs.filter((l) => l.id !== newLogId)];
    onLogsUpdated(updated);
    await setCachedProductionLogs(updated);

    // Close form immediately so the user cannot double-click
    setIsAddFormVisible(false);

    try {
      await addProductionLogInBackend(newLog);
    } catch (err) {
      console.warn('Error saving production log in backend', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (log: ProductionLog) => {
    setEditingLog(log);
    setEditLogName(log.name);
    setEditLogQtyStr(log.qty.toString());
    setEditLogPriceStr(log.price_ves.toString());
    setEditLogCostStr(log.cost_ves.toString());
  };

  const handleSaveEdit = async () => {
    if (!editingLog || isSubmitting) return;
    const trimmed = editLogName.trim();
    const qty = parseInt(editLogQtyStr, 10) || 0;
    const price = parseFloat(editLogPriceStr) || 0;
    const cost = parseFloat(editLogCostStr) || 0;

    if (!trimmed || qty <= 0 || price <= 0) {
      Alert.alert('Datos requeridos', 'Por favor ingresa un nombre, cantidad y precio valido.');
      return;
    }

    setIsSubmitting(true);

    const updatedLog: ProductionLog = {
      ...editingLog,
      name: trimmed,
      qty,
      price_ves: price,
      cost_ves: cost,
    };

    // Optimistically update UI and cache immediately
    const updated = logs.map((l) => (l.id === editingLog.id ? updatedLog : l));
    onLogsUpdated(updated);
    await setCachedProductionLogs(updated);
    setEditingLog(null);

    try {
      await updateProductionLogInBackend(updatedLog);
    } catch (err) {
      console.warn('Error updating production log in backend', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLog = (id: string) => {
    const logToDelete = logs.find((l) => l.id === id);
    if (!logToDelete) return;

    if (editingLog?.id === id) {
      setEditingLog(null);
    }

    // Immediately remove from UI and cache
    const updated = logs.filter((l) => l.id !== id);
    onLogsUpdated(updated);
    setCachedProductionLogs(updated);

    // Provide Undo state
    setDeletedLogToUndo(logToDelete);

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // 5-second grace period before permanent deletion in backend
    undoTimerRef.current = setTimeout(async () => {
      await deleteProductionLogInBackend(id, logToDelete);
      setDeletedLogToUndo(null);
    }, 5000);
  };

  const handleUndoDelete = async () => {
    if (!deletedLogToUndo) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const itemToRestore = deletedLogToUndo;
    setDeletedLogToUndo(null);

    const restored = [itemToRestore, ...logs];
    onLogsUpdated(restored);
    await setCachedProductionLogs(restored);
    await restoreProductionLogInBackend(itemToRestore.id, itemToRestore);
  };


  return (
    <View style={styles.screenWrapper}>
      {/* Page Header matching simulation.html */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Produccion</Text>
        <Text style={styles.pageHeaderSub}>Desliza fila para borrar</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={THEME.colors.accent}
            colors={[THEME.colors.accent]}
          />
        }
      >
        {/* Metric Hero: Ventas Totales Producidas matching simulation.html */}
        <View style={styles.metricHero}>
          <Text style={styles.metricHeroTitle}>Ventas Totales Producidas</Text>
          <View style={styles.metricHeroAmountRow}>
            <Text style={styles.metricHeroAmount}>
              Bs. {totalGrossVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.metricHeroSub}>
              ${grossUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </Text>
          </View>

          <View style={styles.metricBreakdown}>
            <View style={styles.metricPill}>
              <Text style={styles.metricPillLabel}>Fondo Insumos (Reponer)</Text>
              <Text style={[styles.metricPillVal, { color: THEME.colors.accentLight }]}>
                Bs. {totalReinvestVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricPillLabel}>Ganancia Libre Neta</Text>
              <Text style={[styles.metricPillVal, { color: THEME.colors.success }]}>
                Bs. {netProfitVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

        {/* Production Log Section */}
        <View style={styles.prodSectionCard}>
          <View style={styles.prodSectionHeader}>
            <View>
              <Text style={styles.prodSectionTitle}>REGISTRO DE PRODUCCION</Text>
              <Text style={styles.prodSectionSubtitle}>Desliza para borrar o toca para editar</Text>
            </View>
            <TouchableOpacity
              style={styles.addProdBtn}
              onPress={() => setIsAddFormVisible(!isAddFormVisible)}
              activeOpacity={0.7}
            >
              <Plus size={13} color={THEME.colors.accent} strokeWidth={2.4} />
              <Text style={styles.addProdBtnText}>Añadir</Text>
            </TouchableOpacity>
          </View>

          {/* Expandable Form */}
          {isAddFormVisible && (
            <View style={styles.addProdFormBox}>
              <Text style={styles.formPromptTitle}>Nuevo Producto en Produccion</Text>

              {/* Presets based on actual recipes */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetButtonsRow}
              >
                {recipes.map((recipe) => {
                  const isActive = prodName.toLowerCase().trim() === recipe.title.toLowerCase().trim();
                  const unitCostVes = recipe.pack_cost_usd * rates.usd_ves;
                  return (
                    <TouchableOpacity
                      key={recipe.id}
                      style={[styles.presetBtn, isActive && styles.presetBtnActive]}
                      onPress={() => handleSelectRecipePreset(recipe)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.presetBtnTitle, isActive && styles.presetBtnTitleActive]} numberOfLines={1}>
                        {recipe.title}
                      </Text>
                      <View style={styles.presetBtnSubRow}>
                        <Text style={[styles.presetBtnSubText, isActive && styles.presetBtnSubTextActive]}>
                          {recipe.batch_yield} un
                        </Text>
                        <Text style={[styles.presetBtnSubText, isActive && styles.presetBtnSubTextActive]}>
                          Bs. {unitCostVes.toFixed(0)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Nombre del producto</Text>
                <TextInput
                  style={styles.input}
                  value={prodName}
                  onChangeText={setProdName}
                  placeholder="Ej: Galletas Clasicas"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              <View style={styles.rowFields}>
                <View style={[styles.fieldWrapper, { flex: 1 }]}>
                  <Text style={styles.label}>Packs hechos</Text>
                  <TextInput
                    style={styles.input}
                    value={prodQtyStr}
                    onChangeText={setProdQtyStr}
                    keyboardType="numeric"
                    placeholder="40"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>

                <View style={[styles.fieldWrapper, { flex: 1 }]}>
                  <Text style={styles.label}>Precio venta (Bs)</Text>
                  <TextInput
                    style={styles.input}
                    value={prodPriceStr}
                    onChangeText={setProdPriceStr}
                    keyboardType="numeric"
                    placeholder="1000"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>
              </View>

              {/* Financial Projection Live Card */}
              <View style={styles.liveProjectionBox}>
                <View style={styles.liveProjRow}>
                  <Text style={styles.liveProjMuted}>Ventas Estimadas:</Text>
                  <Text style={styles.liveProjValueWhite}>
                    Bs. {previewGrossVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.liveProjDivider} />
                <View style={styles.liveProjRow}>
                  <View>
                    <Text style={styles.liveProjAccentLabel}>Fondo Insumos (Reponer):</Text>
                    <Text style={styles.liveProjTinyDesc}>Intocable para materia prima</Text>
                  </View>
                  <Text style={styles.liveProjValueAmber}>
                    Bs. {previewCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.liveProjDivider} />
                <View style={styles.liveProjRow}>
                  <View>
                    <Text style={styles.liveProjSuccessLabel}>Ganancia Libre:</Text>
                    <Text style={styles.liveProjTinyDesc}>Margen neto disponible</Text>
                  </View>
                  <Text style={styles.liveProjValueGreen}>
                    Bs. {previewNetVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitProdBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleAddProduction}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.submitProdBtnText}>
                  {isSubmitting ? 'Guardando...' : 'Aceptar y Guardar Lote'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* List of items */}
          <View style={styles.logsList}>
            {activeLogs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Sin lotes registrados</Text>
                <Text style={styles.emptyText}>Toca en Añadir para registrar los packs producidos hoy.</Text>
              </View>
            ) : (
              activeLogs.map((item) => {
                const itemGross = item.qty * item.price_ves;
                const itemCost = item.qty * item.cost_ves;
                const itemProfit = itemGross - itemCost;
                const itemProfitUsd = rates.usd_ves > 0 ? itemProfit / rates.usd_ves : 0;
                const itemGrossUsd = rates.usd_ves > 0 ? itemGross / rates.usd_ves : 0;

                return (
                  <SwipeableRow
                    key={item.id}
                    onDelete={() => handleDeleteLog(item.id)}
                    deleteLabel="Eliminar"
                  >
                    <TouchableOpacity
                      style={styles.logCard}
                      onPress={() => handleOpenEdit(item)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.logLeft}>
                        <Text style={styles.logName}>{item.name}</Text>
                        <Text style={styles.logPacksText}>
                          {item.qty} packs a Bs. {item.price_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} c/u
                        </Text>
                        <Text style={styles.logProfitText}>
                          Ganancia: Bs. {itemProfit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${itemProfitUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </Text>
                      </View>

                      <View style={styles.logRight}>
                        <View style={styles.logPriceBlock}>
                          <Text style={styles.logGrossVes}>
                            Bs. {itemGross.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <Text style={styles.logGrossUsd}>
                            ${itemGrossUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.editIconBtn}
                          onPress={() => handleOpenEdit(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Pencil size={13} color={THEME.colors.textMuted} strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </SwipeableRow>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Undo (Deshacer) Banner */}
      {deletedLogToUndo && (
        <View style={styles.undoSnackbar}>
          <View style={styles.undoTextWrapper}>
            <Text style={styles.undoSnackbarTitle} numberOfLines={1}>
              {`Lote "${deletedLogToUndo.name}" eliminado`}
            </Text>
            <Text style={styles.undoSnackbarSub}>Se borrara permanentemente en 5s</Text>
          </View>
          <TouchableOpacity
            style={styles.undoActionBtn}
            onPress={handleUndoDelete}
            activeOpacity={0.8}
          >
            <Undo2 size={13} color="#09090b" strokeWidth={2.6} />
            <Text style={styles.undoActionText}>DESHACER</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Edit Production Log Modal (Bóveda Bottom Sheet) */}
      {editingLog && (
        <Modal
          visible={!!editingLog}
          transparent
          animationType="slide"
          onRequestClose={() => setEditingLog(null)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdropDismiss}
              activeOpacity={1}
              onPress={() => setEditingLog(null)}
            />
            <View style={styles.sheetBox}>
              <View style={styles.sheetHandle} />

              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Editar Lote</Text>
                  <Text style={styles.modalSubtitle}>{editingLog.name}</Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setEditingLog(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <X size={16} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.fieldWrapper}>
                  <Text style={styles.label}>Nombre del producto</Text>
                  <TextInput
                    style={styles.input}
                    value={editLogName}
                    onChangeText={setEditLogName}
                    placeholder="Ej: Galletas Clasicas"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>

                <View style={styles.rowFields}>
                  <View style={[styles.fieldWrapper, { flex: 1 }]}>
                    <Text style={styles.label}>Packs hechos (un)</Text>
                    <TextInput
                      style={styles.input}
                      value={editLogQtyStr}
                      onChangeText={setEditLogQtyStr}
                      keyboardType="numeric"
                      placeholder="40"
                      placeholderTextColor={THEME.colors.textMuted}
                    />
                  </View>

                  <View style={[styles.fieldWrapper, { flex: 1 }]}>
                    <Text style={styles.label}>Precio venta (Bs.)</Text>
                    <TextInput
                      style={styles.input}
                      value={editLogPriceStr}
                      onChangeText={setEditLogPriceStr}
                      keyboardType="numeric"
                      placeholder="1000"
                      placeholderTextColor={THEME.colors.textMuted}
                    />
                  </View>
                </View>

                <View style={styles.fieldWrapper}>
                  <Text style={styles.label}>Costo unitario por pack (Bs.)</Text>
                  <TextInput
                    style={styles.input}
                    value={editLogCostStr}
                    onChangeText={setEditLogCostStr}
                    keyboardType="numeric"
                    placeholder="286.93"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveModalBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.saveModalBtnText}>
                  {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  pageHeaderSub: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    padding: 16,
    paddingTop: 4,
    gap: 14,
    paddingBottom: 30,
  },
  metricHero: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  metricHeroTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricHeroAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: 12,
  },
  metricHeroAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  metricHeroSub: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.accentLight,
    fontVariant: ['tabular-nums'],
  },
  metricBreakdown: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  metricPill: {
    flex: 1,
    backgroundColor: THEME.colors.cardElevated,
    borderRadius: THEME.radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metricPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
  },
  metricPillVal: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  netProfitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  netProfitTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.8,
  },
  netProfitAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  netProfitVes: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  netProfitUsd: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.accentLight,
    fontVariant: ['tabular-nums'],
  },
  marginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
  },
  marginLabel: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  marginPill: {
    backgroundColor: THEME.colors.successBg,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  marginValue: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.success,
  },
  secondaryCardsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  secCard: {
    flex: 1,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  secCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  secCardVes: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  secCardUsd: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  secCardSub: {
    fontSize: 9,
    color: THEME.colors.textMuted,
  },
  prodSectionCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    gap: 12,
  },
  prodSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  prodSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.6,
  },
  prodSectionSubtitle: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  addProdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addProdBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  addProdFormBox: {
    backgroundColor: '#09090b',
    borderRadius: THEME.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    gap: 10,
  },
  formPromptTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  presetBtn: {
    backgroundColor: THEME.colors.card,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 120,
    gap: 4,
  },
  presetBtnActive: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.accent,
  },
  presetBtnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  presetBtnTitleActive: {
    color: THEME.colors.accentLight,
  },
  presetBtnSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  presetBtnSubText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  presetBtnSubTextActive: {
    color: THEME.colors.accentLight,
    opacity: 0.9,
  },
  liveProjectionBox: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.sm,
    padding: 10,
    gap: 6,
  },
  liveProjRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveProjDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 2,
  },
  liveProjMuted: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
  },
  liveProjValueWhite: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  liveProjAccentLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accentLight,
    textTransform: 'uppercase',
  },
  liveProjTinyDesc: {
    fontSize: 9,
    color: THEME.colors.textMuted,
  },
  liveProjValueAmber: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accentLight,
    fontVariant: ['tabular-nums'],
  },
  liveProjSuccessLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.success,
    textTransform: 'uppercase',
  },
  liveProjValueGreen: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.success,
    fontVariant: ['tabular-nums'],
  },
  fieldWrapper: {},
  rowFields: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  submitProdBtn: {
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  submitProdBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#09090b',
  },
  logsList: {
    gap: 8,
  },
  logCard: {
    backgroundColor: '#09090b',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logLeft: {
    flex: 1,
  },
  logName: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  logPacksText: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  logProfitText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accentLight,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  logRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logPriceBlock: {
    alignItems: 'flex-end',
  },
  logGrossVes: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  logGrossUsd: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  deleteBtn: {
    padding: 6,
  },
  editIconBtn: {
    padding: 6,
    borderRadius: THEME.radius.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  emptyCard: {
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  emptyText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    textAlign: 'center',
  },
  // Undo Floating Snackbar
  undoSnackbar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#18181b',
    borderRadius: THEME.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.4)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    zIndex: 9999,
  },
  undoTextWrapper: {
    flex: 1,
    marginRight: 12,
  },
  undoSnackbarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  undoSnackbarSub: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  undoActionBtn: {
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  undoActionText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#09090b',
    letterSpacing: 0.5,
  },
  // Edit Modal (Bóveda Bottom Sheet)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalBackdropDismiss: {
    ...StyleSheet.absoluteFill,
  },
  sheetBox: {
    backgroundColor: THEME.colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 24,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    gap: 10,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
  },
  deleteModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  deleteModalBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.danger,
  },
  saveModalBtn: {
    flex: 1,
    backgroundColor: THEME.colors.accent,
    paddingVertical: 10,
    borderRadius: THEME.radius.sm,
    alignItems: 'center',
  },
  saveModalBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#09090b',
  },
});
