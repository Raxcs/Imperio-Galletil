import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  RefreshControl,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Plus, Check, X, Calendar, Undo2 } from 'lucide-react-native';
import { THEME } from '../theme';
import { Debt, ExchangeRates, Recipe } from '../types';
import { SwipeableRow } from '../components/SwipeableRow';
import {
  fetchDebts,
  saveDebtInBackend,
  deleteDebtInBackend,
  restoreDebtInBackend,
  togglePaidDebtInBackend,
  clearPaidDebtsInBackend,
  AUTO_PURGE_DAYS,
  setCachedDebts,
} from '../services/debtsService';
import { generateId } from '../lib/sync';

export interface QuickPresetProduct {
  id: string;
  name: string;
  unitPrice: number;
}

interface DebtsScreenProps {
  debts: Debt[];
  rates: ExchangeRates;
  recipes?: Recipe[];
  onDebtsUpdated: (debts: Debt[]) => void;
}

export const DebtsScreen: React.FC<DebtsScreenProps> = ({
  debts,
  rates,
  recipes,
  onDebtsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await fetchDebts();
      if (fresh) {
        onDebtsUpdated(fresh);
      }
    } catch (err) {
      console.warn('Error refreshing debts', err);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Create / Edit state
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');

  // Undo (Deshacer) state
  const [deletedDebtToUndo, setDeletedDebtToUndo] = useState<Debt | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const todayISO = new Date().toISOString().split('T')[0];

  const pendingDebts = debts.filter((d) => !d.paid);
  const historyDebts = debts.filter((d) => d.paid);

  const totalPendingVes = pendingDebts.reduce((sum, d) => sum + d.amount, 0);
  const totalPendingUsd = rates.usd_ves > 0 ? totalPendingVes / rates.usd_ves : 0;

  const parseISODate = (isoStr?: string | null): Date => {
    if (!isoStr) return new Date();
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d);
    }
    return new Date();
  };

  const formatDisplayDate = (d: Date): string => {
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday ? `Hoy (${day}/${month}/${year})` : `${day}/${month}/${year}`;
  };

  const quickProducts: QuickPresetProduct[] = useMemo(() => {
    if (recipes && recipes.length > 0) {
      return recipes.map((r) => {
        const lower = r.title.toLowerCase();
        const unitPrice = lower.includes('brownie') ? 2500 : 1000;
        return {
          id: r.id,
          name: r.title,
          unitPrice,
        };
      });
    }
    return [
      { id: 'cookies', name: 'Galletas Clasicas', unitPrice: 1000 },
      { id: 'brownies', name: 'Brownie con Galleta', unitPrice: 2500 },
    ];
  }, [recipes]);

  const getProductShortLabel = (p: QuickPresetProduct) => {
    const lower = p.name.toLowerCase();
    if (lower.includes('brownie')) return 'Brownies';
    if (lower.includes('galleta')) return 'Galletas';
    return p.name;
  };

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productQty, setProductQty] = useState<number>(1);

  const openCreateForm = (presetProduct?: QuickPresetProduct) => {
    setEditingDebt(null);
    setName('');
    const now = new Date();
    setSelectedDate(now);
    setDateStr(todayISO);

    if (presetProduct && typeof presetProduct === 'object' && 'unitPrice' in presetProduct) {
      setSelectedProductId(presetProduct.id);
      setProductQty(1);
      setAmountStr(presetProduct.unitPrice.toString());
      const short = getProductShortLabel(presetProduct);
      setNote(`1 pack ${short}`);
    } else {
      setSelectedProductId(null);
      setProductQty(1);
      setAmountStr('');
      setNote('');
    }
    setIsFormVisible(true);
  };

  const openEditForm = (debt: Debt) => {
    setEditingDebt(debt);
    setSelectedProductId(null);
    setProductQty(1);
    setName(debt.name);
    setAmountStr(debt.amount.toString());
    const parsed = parseISODate(debt.debt_date);
    setSelectedDate(parsed);
    setDateStr(debt.debt_date || todayISO);
    setNote(debt.note || '');
    setIsFormVisible(true);
  };

  const handleCloseForm = () => {
    setIsFormVisible(false);
    setEditingDebt(null);
    setSelectedProductId(null);
    setProductQty(1);
  };

  const handleSelectQuickProduct = (product: QuickPresetProduct) => {
    const short = getProductShortLabel(product);
    if (selectedProductId === product.id) {
      const nextQty = productQty < 5 ? productQty + 1 : 1;
      setProductQty(nextQty);
      setAmountStr((product.unitPrice * nextQty).toString());
      setNote(nextQty === 1 ? `1 pack ${short}` : `${nextQty} packs ${short}`);
    } else {
      setSelectedProductId(product.id);
      setProductQty(1);
      setAmountStr(product.unitPrice.toString());
      setNote(`1 pack ${short}`);
    }
  };

  const handleSelectQuantity = (product: QuickPresetProduct, qty: number) => {
    const short = getProductShortLabel(product);
    setSelectedProductId(product.id);
    setProductQty(qty);
    setAmountStr((product.unitPrice * qty).toString());
    setNote(qty === 1 ? `1 pack ${short}` : `${qty} packs ${short}`);
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && date) {
      setSelectedDate(date);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      setDateStr(`${y}-${m}-${d}`);
    }
  };

  const handleSaveDebt = async () => {
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const numAmount = parseFloat(amountStr) || 0;

    if (!trimmedName || numAmount <= 0) {
      Alert.alert('Datos requeridos', 'Por favor ingresa un nombre y un monto valido.');
      return;
    }

    setIsSubmitting(true);
    const finalDateStr = dateStr || todayISO;

    if (editingDebt) {
      const updated: Debt = {
        ...editingDebt,
        name: trimmedName,
        amount: numAmount,
        debt_date: finalDateStr,
        note: note.trim(),
      };
      const newDebts = debts.map((d) => (d.id === editingDebt.id ? updated : d));
      onDebtsUpdated(newDebts);
      await setCachedDebts(newDebts);
      setIsFormVisible(false);
      setEditingDebt(null);
      setSelectedProductId(null);
      setProductQty(1);

      try {
        await saveDebtInBackend(updated);
      } catch (err) {
        console.warn('Error saving edited debt in backend', err);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const newDebtId = generateId();
      const newDebt: Debt = {
        id: newDebtId,
        name: trimmedName,
        amount: numAmount,
        debt_date: finalDateStr,
        note: note.trim(),
        paid: false,
        paid_date: null,
        created_at: new Date().toISOString(),
      };
      const newDebts = [newDebt, ...debts.filter((d) => d.id !== newDebtId)];
      onDebtsUpdated(newDebts);
      await setCachedDebts(newDebts);
      setIsFormVisible(false);
      setActiveTab('pending');
      setSelectedProductId(null);
      setProductQty(1);

      try {
        await saveDebtInBackend(newDebt);
      } catch (err) {
        console.warn('Error creating debt in backend', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteDebtItem = (debtToDelete: Debt) => {
    const debtIdToDelete = debtToDelete.id;

    if (editingDebt?.id === debtIdToDelete) {
      setIsFormVisible(false);
      setEditingDebt(null);
    }

    // Remove immediately from UI & local cache
    const updated = debts.filter((d) => d.id !== debtIdToDelete);
    onDebtsUpdated(updated);
    setCachedDebts(updated);

    // Provide Undo state
    setDeletedDebtToUndo(debtToDelete);

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // Strictly 5 second grace period before permanent deletion in backend
    undoTimerRef.current = setTimeout(async () => {
      await deleteDebtInBackend(debtIdToDelete, debtToDelete);
      setDeletedDebtToUndo(null);
    }, 5000);
  };

  const handleUndoDelete = async () => {
    if (!deletedDebtToUndo) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const debtToRestore = deletedDebtToUndo;
    setDeletedDebtToUndo(null);

    const restored = [debtToRestore, ...debts];
    onDebtsUpdated(restored);
    await setCachedDebts(restored);
    await restoreDebtInBackend(debtToRestore.id, debtToRestore);
  };

  const handleTogglePaid = async (debt: Debt) => {
    const nextPaid = !debt.paid;
    const nextPaidDate = nextPaid ? todayISO : null;

    const updatedDebts = debts.map((d) =>
      d.id === debt.id ? { ...d, paid: nextPaid, paid_date: nextPaidDate } : d
    );
    onDebtsUpdated(updatedDebts);
    await setCachedDebts(updatedDebts);
    await togglePaidDebtInBackend(debt.id, nextPaid);
  };

  const handleClearHistory = () => {
    if (historyDebts.length === 0) return;
    Alert.alert(
      'Vaciar Historial',
      '¿Deseas vaciar todas las cuentas cobradas del historial?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: async () => {
            const updated = debts.filter((d) => !d.paid);
            onDebtsUpdated(updated);
            await setCachedDebts(updated);
            await clearPaidDebtsInBackend(historyDebts);
          },
        },
      ]
    );
  };

  const renderDebtItem = (item: Debt) => {
    let daysAgo = 0;
    try {
      const dObj = parseISODate(item.debt_date);
      const now = new Date();
      daysAgo = Math.floor(Math.abs(now.getTime() - dObj.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      daysAgo = 0;
    }

    let statusText = '';
    if (item.paid) {
      let daysSincePaid = 0;
      try {
        const pObj = parseISODate(item.paid_date || item.debt_date);
        const now = new Date();
        daysSincePaid = Math.floor(Math.abs(now.getTime() - pObj.getTime()) / (1000 * 60 * 60 * 24));
      } catch {
        daysSincePaid = 0;
      }
      const daysLeft = Math.max(1, AUTO_PURGE_DAYS - daysSincePaid);
      statusText = `Cobrado hace ${daysSincePaid} ${daysSincePaid === 1 ? 'dia' : 'dias'} (se borra en ${daysLeft}d)`;
    } else {
      const dayLabel = daysAgo === 0 ? 'Hoy' : `Debe hace ${daysAgo} ${daysAgo === 1 ? 'dia' : 'dias'}`;
      const dateFormatted = item.debt_date ? item.debt_date.split('-').reverse().join('/') : '';
      statusText = `${dayLabel} (${dateFormatted})`;
    }

    const usdVal = rates.usd_ves > 0 ? item.amount / rates.usd_ves : 0;

    return (
      <SwipeableRow
        key={item.id}
        onDelete={() => handleDeleteDebtItem(item)}
        deleteLabel="Eliminar"
      >
        <TouchableOpacity
          style={[styles.debtCard, item.paid && styles.debtCardPaid]}
          onLongPress={() => openEditForm(item)}
          onPress={() => openEditForm(item)}
          delayLongPress={400}
          activeOpacity={0.85}
        >
          <View style={styles.debtCardHeader}>
            <View style={styles.debtLeftRow}>
              <TouchableOpacity
                style={[styles.checkbox, item.paid && styles.checkboxActive]}
                onPress={() => handleTogglePaid(item)}
                activeOpacity={0.7}
              >
                {item.paid && <Check size={13} color="#09090b" strokeWidth={3} />}
              </TouchableOpacity>

              <View style={styles.debtNameWrapper}>
                <Text style={styles.debtName}>{item.name}</Text>
                <Text style={[styles.debtStatus, item.paid ? styles.debtStatusPaid : styles.debtStatusPending]}>
                  {statusText}
                </Text>
              </View>
            </View>

            <View style={styles.debtAmountWrapper}>
              <Text style={[styles.debtAmountVes, item.paid ? styles.amountPaid : styles.amountPending]}>
                Bs. {item.amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.debtAmountUsd}>
                ${usdVal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </Text>
            </View>
          </View>

          {!!item.note && (
            <View style={styles.noteContainer}>
              <Text style={styles.noteText}>{item.note}</Text>
            </View>
          )}
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  const displayedList = activeTab === 'pending' ? pendingDebts : historyDebts;

  return (
    <View style={styles.screenWrapper}>
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
        {/* Pending Total Banner */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Text style={styles.summaryTitle}>TOTAL PENDIENTE POR COBRAR</Text>
          </View>

          <View style={styles.summaryAmountRow}>
            <Text style={styles.summaryTotalVes}>
              Bs. {totalPendingVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryTotalUsd}>
              ${totalPendingUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </Text>
          </View>
          <Text style={styles.summaryCaption}>Dinero fiado pendiente por ingresar a caja</Text>
        </View>

        {/* Quick Sell / Pre-fill Debt Launcher Bar */}
        {activeTab === 'pending' && (
          <View style={styles.quickAccessCard}>
            <View style={styles.quickAccessHeader}>
              <Text style={styles.quickAccessTitle}>VENTA RAPIDA POR COBRAR</Text>
              <Text style={styles.quickAccessHint}>Toca para registrar al instante</Text>
            </View>
            <View style={styles.quickAccessButtonsRow}>
              {quickProducts.map((p) => {
                const shortName = getProductShortLabel(p);
                const approxUsd = rates.usd_ves > 0 ? (p.unitPrice / rates.usd_ves).toFixed(2) : '0.00';
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.quickAccessLaunchBtn}
                    onPress={() => openCreateForm(p)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.quickLaunchTop}>
                      <Text style={styles.quickLaunchName} numberOfLines={1}>
                        {shortName}
                      </Text>
                      <View style={styles.quickLaunchBadge}>
                        <Plus size={12} color={THEME.colors.accent} strokeWidth={2.8} />
                      </View>
                    </View>
                    <View style={styles.quickLaunchBottom}>
                      <Text style={styles.quickLaunchPrice}>
                        Bs. {p.unitPrice.toLocaleString('es-VE')}
                      </Text>
                      <Text style={styles.quickLaunchUsd}>
                        ≈ ${approxUsd} USD
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Tab Switcher: Pendientes vs Historial */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
            onPress={() => setActiveTab('pending')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}>
              Pendientes ({pendingDebts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
              Historial ({historyDebts.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Subtitle / Action Info */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLeft}>
            {activeTab === 'pending'
              ? 'Cuentas por cobrar activas'
              : 'Borrado automatico tras 30 dias'}
          </Text>
          {activeTab === 'pending' ? (
            <Text style={styles.infoRight}>Manten presionado para editar</Text>
          ) : (
            <TouchableOpacity onPress={handleClearHistory} activeOpacity={0.7}>
              <Text style={styles.clearHistoryBtn}>Vaciar historial</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        <View style={styles.listContainer}>
          {displayedList.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {activeTab === 'pending' ? 'No hay cuentas pendientes' : 'Historial vacio'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'pending'
                  ? 'Todas las cuentas han sido cobradas o no hay registros activos.'
                  : 'Las cuentas cobradas apareceran aqui y se eliminaran solas a los 30 dias.'}
              </Text>
            </View>
          ) : (
            displayedList.map(renderDebtItem)
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fabBtn}
        onPress={() => openCreateForm()}
        activeOpacity={0.85}
      >
        <Plus size={24} color="#09090b" strokeWidth={2.6} />
      </TouchableOpacity>

      {/* Undo (Deshacer) Floating Snackbar */}
      {deletedDebtToUndo && (
        <View style={styles.undoSnackbar}>
          <View style={styles.undoTextWrapper}>
            <Text style={styles.undoSnackbarTitle} numberOfLines={1}>
              Cuenta de {deletedDebtToUndo.name} eliminada
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

      {/* Create / Edit Bóveda Bottom Sheet Modal */}
      <Modal
        visible={isFormVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseForm}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdropDismiss}
            activeOpacity={1}
            onPress={handleCloseForm}
          />
          <View style={styles.sheetBox}>
            <View style={styles.sheetHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDebt ? 'Editar Cuenta' : 'Nueva Cuenta por Cobrar'}
              </Text>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={handleCloseForm}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <X size={16} color={THEME.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Quick Access Product Presets */}
            <View style={styles.presetSection}>
              <View style={styles.presetSectionHeader}>
                <Text style={styles.presetSectionTitle}>PRODUCTO DEL PEDIDO</Text>
                {selectedProductId && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedProductId(null);
                      setProductQty(1);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.presetClearText}>Limpiar seleccion</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.presetButtonsRow}>
                {quickProducts.map((p) => {
                  const isSelected = selectedProductId === p.id;
                  const shortName = getProductShortLabel(p);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.presetProductBtn, isSelected && styles.presetProductBtnActive]}
                      onPress={() => handleSelectQuickProduct(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.presetBtnName, isSelected && styles.presetBtnNameActive]}>
                        {shortName}
                      </Text>
                      <Text style={styles.presetBtnPrice}>
                        Bs. {p.unitPrice.toLocaleString('es-VE')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quantity selector pills if a quick product is selected */}
              {selectedProductId && (
                <View style={styles.qtyRow}>
                  <View style={styles.qtyHeaderRow}>
                    <Text style={styles.qtyLabel}>Cantidad de packs:</Text>
                  </View>
                  <View style={styles.qtyPills}>
                    {[1, 2, 3, 4, 5].map((q) => {
                      const isQtyActive = productQty === q;
                      const currentProd = quickProducts.find((p) => p.id === selectedProductId);
                      return (
                        <TouchableOpacity
                          key={q}
                          style={[styles.qtyPill, isQtyActive && styles.qtyPillActive]}
                          onPress={() => currentProd && handleSelectQuantity(currentProd, q)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.qtyPillText, isQtyActive && styles.qtyPillTextActive]}>
                            {`${q}x`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Dynamic calculation banner identical to simulation.html */}
                  {(() => {
                    const currentProd = quickProducts.find((p) => p.id === selectedProductId);
                    if (!currentProd) return null;
                    const totalBs = currentProd.unitPrice * productQty;
                    const approxUsd = rates.usd_ves > 0 ? (totalBs / rates.usd_ves).toFixed(2) : '0.00';
                    const prodName = getProductShortLabel(currentProd);
                    return (
                      <View style={styles.debtCalcHint}>
                        <Text style={styles.debtCalcHintText}>
                          {`${productQty} pack${productQty > 1 ? 's' : ''} de ${prodName} = Bs. ${totalBs.toLocaleString('es-VE')} (≈ $${approxUsd} USD)`}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>

            <View style={styles.fieldWrapper}>
              <Text style={styles.label}>Nombre de la persona</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ejemplo: Maria Gonzalez"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.fieldWrapper, { flex: 1 }]}>
                <Text style={styles.label}>Monto en Bolivares</Text>
                <TextInput
                  style={styles.input}
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="numeric"
                  placeholder="Ej: 1000"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              {/* Native Date Picker Button */}
              <View style={[styles.fieldWrapper, { flex: 1 }]}>
                <Text style={styles.label}>Fecha</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Calendar size={15} color={THEME.colors.accent} strokeWidth={2} />
                  <Text style={styles.datePickerBtnText} numberOfLines={1}>
                    {formatDisplayDate(selectedDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Native DateTimePicker Component */}
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                themeVariant="dark"
                onChange={handleDateChange}
              />
            )}

            <View style={styles.fieldWrapper}>
              <Text style={styles.label}>Nota o detalle</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="Ejemplo: Se llevo 1 pack brownie"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={handleSaveDebt}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>
                {isSubmitting ? 'Guardando...' : (editingDebt ? 'Guardar Cambios' : 'Guardar Cuenta')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
    paddingBottom: 96,
  },
  fabBtn: {
    position: 'absolute',
    bottom: 20,
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    zIndex: 99,
  },
  summaryCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.8,
  },
  summaryAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  summaryTotalVes: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  summaryTotalUsd: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.accentLight,
    fontVariant: ['tabular-nums'],
  },
  summaryCaption: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#09090b',
    padding: 3,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: THEME.radius.sm,
  },
  tabBtnActive: {
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  tabBtnTextActive: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  infoLeft: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  infoRight: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  clearHistoryBtn: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  listContainer: {
    gap: 8,
  },
  debtCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 14,
  },
  debtCardPaid: {
    opacity: 0.75,
    backgroundColor: '#101012',
  },
  debtCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  debtLeftRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: THEME.colors.cardBorder,
    backgroundColor: '#09090b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: THEME.colors.success,
    borderColor: THEME.colors.success,
  },
  debtNameWrapper: {
    flex: 1,
  },
  debtName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  debtStatus: {
    fontSize: 11,
    fontWeight: '500',
  },
  debtStatusPending: {
    color: THEME.colors.accent,
  },
  debtStatusPaid: {
    color: THEME.colors.success,
  },
  debtAmountWrapper: {
    alignItems: 'flex-end',
  },
  debtAmountVes: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  amountPending: {
    color: THEME.colors.textPrimary,
  },
  amountPaid: {
    color: THEME.colors.success,
  },
  debtAmountUsd: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  noteContainer: {
    marginTop: 8,
    backgroundColor: '#09090b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  noteText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
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
  fieldWrapper: {},
  rowFields: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#09090b',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#09090b',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  datePickerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: THEME.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#09090b',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: THEME.colors.dangerBg,
    borderRadius: THEME.radius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 4,
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.danger,
  },
  undoSnackbar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 80,
    backgroundColor: '#18181c',
    borderRadius: THEME.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    zIndex: 98,
  },
  undoTextWrapper: {
    flex: 1,
    marginRight: 8,
  },
  undoSnackbarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  undoSnackbarSub: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  undoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radius.sm,
  },
  undoActionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#09090b',
    letterSpacing: 0.5,
  },
  quickAccessCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  quickAccessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickAccessTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.8,
  },
  quickAccessHint: {
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  quickAccessButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAccessLaunchBtn: {
    flex: 1,
    minHeight: 72,
    justifyContent: 'space-between',
    backgroundColor: '#0d0d11',
    borderRadius: THEME.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  quickLaunchTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  quickLaunchName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  quickLaunchBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: THEME.colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLaunchBottom: {
    gap: 1,
  },
  quickLaunchPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.accent,
    fontVariant: ['tabular-nums'],
  },
  quickLaunchUsd: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  presetSection: {
    backgroundColor: '#09090c',
    borderRadius: THEME.radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
  },
  presetSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.8,
  },
  presetClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  presetProductBtn: {
    flex: 1,
    minHeight: 56,
    backgroundColor: THEME.colors.cardElevated,
    borderRadius: THEME.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 2,
  },
  presetProductBtnActive: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.accent,
  },
  presetBtnName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  presetBtnNameActive: {
    color: THEME.colors.accent,
  },
  presetBtnPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.accent,
    fontVariant: ['tabular-nums'],
  },
  qtyRow: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  qtyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  qtyPills: {
    flexDirection: 'row',
    gap: 8,
  },
  qtyPill: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyPillActive: {
    backgroundColor: THEME.colors.accent,
    borderColor: THEME.colors.accent,
  },
  qtyPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  qtyPillTextActive: {
    fontWeight: '900',
    color: '#09090b',
  },
  debtCalcHint: {
    marginTop: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.28)',
    borderRadius: THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  debtCalcHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.accentText,
    textAlign: 'center',
  },
});

