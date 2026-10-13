import React, { useState, useRef } from 'react';
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
import { Debt, ExchangeRates } from '../types';
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

interface DebtsScreenProps {
  debts: Debt[];
  rates: ExchangeRates;
  onDebtsUpdated: (debts: Debt[]) => void;
}

export const DebtsScreen: React.FC<DebtsScreenProps> = ({
  debts,
  rates,
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

  const openCreateForm = () => {
    setEditingDebt(null);
    setName('');
    setAmountStr('');
    const now = new Date();
    setSelectedDate(now);
    setDateStr(todayISO);
    setNote('');
    setIsFormVisible(true);
  };

  const openEditForm = (debt: Debt) => {
    setEditingDebt(debt);
    setName(debt.name);
    setAmountStr(debt.amount.toString());
    const parsed = parseISODate(debt.debt_date);
    setSelectedDate(parsed);
    setDateStr(debt.debt_date || todayISO);
    setNote(debt.note || '');
    setIsFormVisible(true);
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
        onPress={openCreateForm}
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

      {/* Create / Edit Modal */}
      <Modal
        visible={isFormVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFormVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDebt ? 'Editar Cuenta' : 'Nueva Cuenta por Cobrar'}
              </Text>
              <TouchableOpacity onPress={() => setIsFormVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={THEME.colors.textMuted} />
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    gap: 12,
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
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
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
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 12,
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
});
