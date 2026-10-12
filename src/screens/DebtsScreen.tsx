import React, { useState } from 'react';
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
} from 'react-native';
import { Plus, Check } from 'lucide-react-native';
import { THEME } from '../theme';
import { Debt, ExchangeRates } from '../types';
import {
  fetchDebts,
  saveDebtInBackend,
  togglePaidDebtInBackend,
  clearPaidDebtsInBackend,
  AUTO_PURGE_DAYS,
  setCachedDebts,
} from '../services/debtsService';

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
  const [note, setNote] = useState('');

  const todayISO = new Date().toISOString().split('T')[0];

  const pendingDebts = debts.filter((d) => !d.paid);
  const historyDebts = debts.filter((d) => d.paid);

  const totalPendingVes = pendingDebts.reduce((sum, d) => sum + d.amount, 0);
  const totalPendingUsd = totalPendingVes / rates.usd_ves;

  const openCreateForm = () => {
    setEditingDebt(null);
    setName('');
    setAmountStr('');
    setDateStr(todayISO);
    setNote('');
    setIsFormVisible(true);
  };

  const openEditForm = (debt: Debt) => {
    setEditingDebt(debt);
    setName(debt.name);
    setAmountStr(debt.amount.toString());
    setDateStr(debt.debt_date || todayISO);
    setNote(debt.note || '');
    setIsFormVisible(true);
  };

  const handleSaveDebt = async () => {
    const trimmedName = name.trim();
    const numAmount = parseFloat(amountStr) || 0;

    if (!trimmedName || numAmount <= 0) {
      Alert.alert('Datos requeridos', 'Por favor ingresa un nombre y un monto valido.');
      return;
    }

    if (editingDebt) {
      const updated: Debt = {
        ...editingDebt,
        name: trimmedName,
        amount: numAmount,
        debt_date: dateStr || todayISO,
        note: note.trim(),
      };
      const saved = await saveDebtInBackend(updated);
      const newDebts = debts.map((d) => (d.id === editingDebt.id ? saved : d));
      onDebtsUpdated(newDebts);
      await setCachedDebts(newDebts);
    } else {
      const newDebtData: Omit<Debt, 'id'> = {
        name: trimmedName,
        amount: numAmount,
        debt_date: dateStr || todayISO,
        note: note.trim(),
        paid: false,
        paid_date: null,
      };
      const saved = await saveDebtInBackend(newDebtData);
      const newDebts = [saved, ...debts];
      onDebtsUpdated(newDebts);
      await setCachedDebts(newDebts);
      setActiveTab('pending');
    }

    setIsFormVisible(false);
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
      'Deseas vaciar todas las cuentas cobradas del historial?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: async () => {
            const updated = debts.filter((d) => !d.paid);
            onDebtsUpdated(updated);
            await setCachedDebts(updated);
            await clearPaidDebtsInBackend();
          },
        },
      ]
    );
  };

  const renderDebtItem = (item: Debt) => {
    let daysAgo = 0;
    try {
      const dObj = new Date(item.debt_date || todayISO);
      const now = new Date();
      daysAgo = Math.floor(Math.abs(now.getTime() - dObj.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      daysAgo = 0;
    }

    let statusText = '';
    if (item.paid) {
      let daysSincePaid = 0;
      try {
        const pObj = new Date(item.paid_date || item.debt_date || todayISO);
        const now = new Date();
        daysSincePaid = Math.floor(Math.abs(now.getTime() - pObj.getTime()) / (1000 * 60 * 60 * 24));
      } catch {
        daysSincePaid = 0;
      }
      const daysLeft = Math.max(1, AUTO_PURGE_DAYS - daysSincePaid);
      statusText = `Cobrado hace ${daysSincePaid} ${daysSincePaid === 1 ? 'dia' : 'dias'} (se borra en ${daysLeft} dias)`;
    } else {
      const dayLabel = daysAgo === 0 ? 'Hoy' : `Debe hace ${daysAgo} ${daysAgo === 1 ? 'dia' : 'dias'}`;
      const dateFormatted = item.debt_date ? item.debt_date.split('-').reverse().join('/') : '';
      statusText = `${dayLabel} (${dateFormatted})`;
    }

    const usdVal = item.amount / rates.usd_ves;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.debtCard, item.paid && styles.debtCardPaid]}
        onLongPress={() => openEditForm(item)}
        delayLongPress={500}
        activeOpacity={0.85}
      >
        <View style={styles.debtCardHeader}>
          <View style={styles.debtLeftRow}>
            <TouchableOpacity
              style={[styles.checkbox, item.paid && styles.checkboxActive]}
              onPress={() => handleTogglePaid(item)}
            >
              {item.paid && <Check size={14} color="#0c0a09" strokeWidth={3} />}
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
    );
  };

  const displayedList = activeTab === 'pending' ? pendingDebts : historyDebts;

  return (
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
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>
              {pendingDebts.length} {pendingDebts.length === 1 ? 'Persona' : 'Personas'}
            </Text>
          </View>
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

      {/* Button Open Add Debt */}
      <TouchableOpacity style={styles.addBtn} onPress={openCreateForm}>
        <Plus size={16} color={THEME.colors.accent} strokeWidth={2.5} />
        <Text style={styles.addBtnText}>Añadir Persona Pendiente</Text>
      </TouchableOpacity>

      {/* Tab Switcher: Pendientes vs Historial */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}>
            Pendientes ({pendingDebts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
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
          <TouchableOpacity onPress={handleClearHistory}>
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

      {/* Create / Edit Modal */}
      <Modal
        visible={isFormVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFormVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDebt ? 'Editar Cuenta por Cobrar' : 'Registrar Cuenta por Cobrar'}
              </Text>
              <TouchableOpacity onPress={() => setIsFormVisible(false)}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
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

              <View style={[styles.fieldWrapper, { flex: 1 }]}>
                <Text style={styles.label}>Fecha (AAAA/MM/DD)</Text>
                <TextInput
                  style={styles.input}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="2026/10/11"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.fieldWrapper}>
              <Text style={styles.label}>Nota o detalle</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="Ejemplo: Se llevo 1 pack brownie, paga el viernes"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDebt}>
              <Text style={styles.saveBtnText}>
                {editingDebt ? 'Guardar Cambios' : 'Guardar en Lista de Pendientes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
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
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accentLight,
    letterSpacing: 0.5,
  },
  summaryBadge: {
    backgroundColor: THEME.colors.accentDark,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accentLight,
  },
  summaryAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  summaryTotalVes: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  summaryTotalUsd: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  summaryCaption: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.colors.card,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.md,
    paddingVertical: 12,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.accentLight,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.card,
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
    backgroundColor: THEME.colors.accent,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  tabBtnTextActive: {
    color: '#0c0a09',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  infoLeft: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
  infoRight: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
  clearHistoryBtn: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  listContainer: {
    gap: 10,
  },
  debtCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 14,
  },
  debtCardPaid: {
    opacity: 0.85,
    backgroundColor: '#161413',
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
    backgroundColor: '#0c0a09',
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
    fontSize: 10,
    fontWeight: '600',
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
  },
  amountPending: {
    color: THEME.colors.accent,
  },
  amountPaid: {
    color: THEME.colors.success,
  },
  debtAmountUsd: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  noteContainer: {
    marginTop: 8,
    backgroundColor: '#0c0a09',
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
    backgroundColor: '#161413',
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
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
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
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accent,
    textTransform: 'uppercase',
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  fieldWrapper: {},
  rowFields: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0c0a09',
  },
});
