import React, { useState } from 'react';
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
import { Plus, Check } from 'lucide-react-native';
import { THEME } from '../theme';
import { Ingredient, ExchangeRates } from '../types';
import {
  fetchIngredients,
  createIngredientInBackend,
  updateIngredientPriceInBackend,
  setCachedIngredients,
} from '../services/ingredientsService';

interface IngredientsScreenProps {
  ingredients: Ingredient[];
  rates: ExchangeRates;
  onIngredientsUpdated: (ingredients: Ingredient[]) => void;
}

export const IngredientsScreen: React.FC<IngredientsScreenProps> = ({
  ingredients,
  rates,
  onIngredientsUpdated,
}) => {
  const [activeCategory, setActiveCategory] = useState<'todos' | 'galletas' | 'brownies' | 'empaques'>('todos');
  const [isAddFormVisible, setIsAddFormVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await fetchIngredients();
      if (fresh) {
        onIngredientsUpdated(fresh);
      }
    } catch (err) {
      console.warn('Error refreshing ingredients', err);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // New ingredient form state
  const [newName, setNewName] = useState('');
  const [newPresentation, setNewPresentation] = useState('');
  const [newCat, setNewCat] = useState<'galletas' | 'brownies' | 'empaques' | 'ambos'>('galletas');
  const [newPriceUsd, setNewPriceUsd] = useState('');
  const [newPriceVes, setNewPriceVes] = useState('');

  // Edit ingredient price modal state
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [editPriceUsd, setEditPriceUsd] = useState('');
  const [editPriceVes, setEditPriceVes] = useState('');

  // Selected totals
  const selectedIngredients = ingredients.filter((i) => i.selected);
  const selectedTotalVes = selectedIngredients.reduce((sum, i) => sum + i.price_ves, 0);
  const selectedTotalUsd = selectedIngredients.reduce((sum, i) => sum + i.price_usd, 0);

  // Filtered list
  const filteredList = activeCategory === 'todos'
    ? ingredients
    : ingredients.filter((i) => i.category.includes(activeCategory));

  const toggleSelection = async (id: string) => {
    const updated = ingredients.map((i) =>
      i.id === id ? { ...i, selected: !i.selected } : i
    );
    onIngredientsUpdated(updated);
    await setCachedIngredients(updated);
  };

  const handleOpenEditPrice = (item: Ingredient) => {
    setEditingItem(item);
    setEditPriceUsd(item.price_usd.toFixed(2));
    setEditPriceVes(item.price_ves.toFixed(2));
  };

  const handleEditUsdChange = (val: string) => {
    setEditPriceUsd(val);
    const num = parseFloat(val) || 0;
    setEditPriceVes(num > 0 ? (num * rates.usd_ves).toFixed(2) : '');
  };

  const handleEditVesChange = (val: string) => {
    setEditPriceVes(val);
    const num = parseFloat(val) || 0;
    setEditPriceUsd(num > 0 ? (num / rates.usd_ves).toFixed(2) : '');
  };

  const handleSavePrice = async () => {
    if (!editingItem) return;
    const finalUsd = parseFloat(editPriceUsd) || 0;
    const finalVes = parseFloat(editPriceVes) || 0;

    if (finalUsd <= 0 && finalVes <= 0) {
      Alert.alert('Precio invalido', 'Por favor ingresa un precio valido.');
      return;
    }

    const calculatedUsd = finalUsd > 0 ? finalUsd : finalVes / rates.usd_ves;
    const calculatedVes = finalVes > 0 ? finalVes : finalUsd * rates.usd_ves;

    const updated = ingredients.map((i) =>
      i.id === editingItem.id
        ? { ...i, price_usd: calculatedUsd, price_ves: calculatedVes }
        : i
    );

    onIngredientsUpdated(updated);
    await setCachedIngredients(updated);
    await updateIngredientPriceInBackend(editingItem.id, calculatedUsd, calculatedVes);
    setEditingItem(null);
  };

  const handleNewUsdChange = (val: string) => {
    setNewPriceUsd(val);
    const num = parseFloat(val) || 0;
    setNewPriceVes(num > 0 ? (num * rates.usd_ves).toFixed(2) : '');
  };

  const handleNewVesChange = (val: string) => {
    setNewPriceVes(val);
    const num = parseFloat(val) || 0;
    setNewPriceUsd(num > 0 ? (num / rates.usd_ves).toFixed(2) : '');
  };

  const handleSaveNewIngredient = async () => {
    const trimmedName = newName.trim();
    const trimmedPres = newPresentation.trim() || 'Unidad';
    const finalUsd = parseFloat(newPriceUsd) || 0;
    const finalVes = parseFloat(newPriceVes) || 0;

    if (!trimmedName) {
      Alert.alert('Nombre requerido', 'Por favor ingresa el nombre del insumo.');
      return;
    }

    if (finalUsd <= 0 && finalVes <= 0) {
      Alert.alert('Precio requerido', 'Por favor ingresa un precio valido.');
      return;
    }

    const calculatedUsd = finalUsd > 0 ? finalUsd : finalVes / rates.usd_ves;
    const calculatedVes = finalVes > 0 ? finalVes : finalUsd * rates.usd_ves;

    const cats = newCat === 'ambos' ? ['galletas', 'brownies'] : [newCat];

    const newItemData: Omit<Ingredient, 'id'> = {
      name: trimmedName,
      presentation: trimmedPres,
      category: cats,
      price_usd: calculatedUsd,
      price_ves: calculatedVes,
      selected: false,
    };

    const saved = await createIngredientInBackend(newItemData);
    const itemToAdd: Ingredient = saved || {
      ...newItemData,
      id: 'local_' + Date.now(),
    };

    const updated = [itemToAdd, ...ingredients];
    onIngredientsUpdated(updated);
    await setCachedIngredients(updated);

    // Reset form
    setNewName('');
    setNewPresentation('');
    setNewPriceUsd('');
    setNewPriceVes('');
    setIsAddFormVisible(false);
  };

  const categoryTitles = {
    todos: 'Todos los insumos',
    galletas: 'Insumos para Galletas',
    brownies: 'Insumos para Brownies',
    empaques: 'Empaques y Descartables',
  };

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
      {/* Top Banner: Total Seleccionado (solo si hay insumos seleccionados) */}
      {selectedIngredients.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Text style={styles.summaryTitle}>TOTAL SELECCIONADO</Text>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>
                {selectedIngredients.length} {selectedIngredients.length === 1 ? 'Marcado' : 'Marcados'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryAmountRow}>
            <Text style={styles.summaryTotalVes}>
              Bs. {selectedTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryTotalUsd}>
              ${selectedTotalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </Text>
          </View>
        </View>
      )}

      {/* Button Open Form */}
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setIsAddFormVisible(!isAddFormVisible)}
      >
        <Plus size={16} color={THEME.colors.accent} strokeWidth={2.5} />
        <Text style={styles.addBtnText}>Añadir Nuevo Insumo</Text>
      </TouchableOpacity>

      {/* Add Ingredient Form */}
      {isAddFormVisible && (
        <View style={styles.addFormBox}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Registrar Nuevo Insumo</Text>
            <TouchableOpacity onPress={() => setIsAddFormVisible(false)}>
              <Text style={styles.formCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Nombre del insumo</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Ejemplo: Polvo de hornear"
              placeholderTextColor={THEME.colors.textMuted}
            />
          </View>

          <View style={styles.rowFields}>
            <View style={[styles.fieldWrapper, { flex: 1 }]}>
              <Text style={styles.label}>Presentacion</Text>
              <TextInput
                style={styles.input}
                value={newPresentation}
                onChangeText={setNewPresentation}
                placeholder="Ej: Pote de 100g"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <View style={[styles.fieldWrapper, { flex: 1 }]}>
              <Text style={styles.label}>Categoria</Text>
              <View style={styles.catPillRow}>
                {(['galletas', 'brownies', 'empaques', 'ambos'] as const).map((c) => {
                  const isSelected = newCat === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.smallCatPill, isSelected && styles.smallCatPillActive]}
                      onPress={() => setNewCat(c)}
                    >
                      <Text style={[styles.smallCatPillText, isSelected && styles.smallCatPillTextActive]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.rowFields}>
            <View style={[styles.fieldWrapper, { flex: 1 }]}>
              <Text style={styles.label}>Precio Dolares (USD)</Text>
              <TextInput
                style={styles.input}
                value={newPriceUsd}
                onChangeText={handleNewUsdChange}
                keyboardType="numeric"
                placeholder="1.50"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <View style={[styles.fieldWrapper, { flex: 1 }]}>
              <Text style={styles.label}>Precio Bolivares (VES)</Text>
              <TextInput
                style={styles.input}
                value={newPriceVes}
                onChangeText={handleNewVesChange}
                keyboardType="numeric"
                placeholder="1313.55"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSaveNewIngredient}>
            <Text style={styles.submitBtnText}>Guardar Insumo en Catalogo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category Filter Pills */}
      <View style={styles.catSwitcher}>
        {(['todos', 'galletas', 'brownies', 'empaques'] as const).map((cat) => {
          const isActive = activeCategory === cat;
          const labels: Record<string, string> = {
            todos: 'Todos',
            galletas: 'Galletas',
            brownies: 'Brownies',
            empaques: 'Empaques',
          };

          return (
            <TouchableOpacity
              key={cat}
              style={[styles.catBtn, isActive && styles.catBtnActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.catBtnText, isActive && styles.catBtnTextActive]}>
                {labels[cat]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subheader info */}
      <View style={styles.infoRow}>
        <View>
          <Text style={styles.infoSubtitle}>{categoryTitles[activeCategory]}</Text>
          <Text style={styles.infoInstruction}>Manten presionado para editar precio</Text>
        </View>
        <Text style={styles.infoCount}>
          {filteredList.length} {filteredList.length === 1 ? 'articulo' : 'articulos'}
        </Text>
      </View>

      {/* Ingredients List */}
      <View style={styles.listContainer}>
        {filteredList.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.ingCard, item.selected && styles.ingCardSelected]}
            onPress={() => toggleSelection(item.id)}
            onLongPress={() => handleOpenEditPrice(item)}
            delayLongPress={500}
            activeOpacity={0.85}
          >
            <View style={styles.ingLeft}>
              <TouchableOpacity
                style={[styles.checkbox, item.selected && styles.checkboxActive]}
                onPress={() => toggleSelection(item.id)}
              >
                {item.selected && <Check size={14} color="#0c0a09" strokeWidth={3} />}
              </TouchableOpacity>

              <View style={styles.ingTextInfo}>
                <Text style={styles.ingName}>{item.name}</Text>
                <View style={styles.presentationBadge}>
                  <Text style={styles.presentationText}>{item.presentation}</Text>
                </View>
              </View>
            </View>

            <View style={styles.ingRight}>
              <Text style={styles.ingPriceVes}>
                Bs. {item.price_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.ingPriceUsd}>
                ${item.price_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Edit Price Modal */}
      {editingItem && (
        <Modal
          visible={!!editingItem}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalHeaderTitle}>MODIFICAR PRECIO</Text>
                  <Text style={styles.modalHeaderItemName}>{editingItem.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setEditingItem(null)}>
                  <Text style={styles.modalCloseText}>Cerrar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Precio en Dolares (USD)</Text>
                <TextInput
                  style={styles.input}
                  value={editPriceUsd}
                  onChangeText={handleEditUsdChange}
                  keyboardType="numeric"
                  placeholder="1.50"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Precio en Bolivares (VES)</Text>
                <TextInput
                  style={styles.input}
                  value={editPriceVes}
                  onChangeText={handleEditVesChange}
                  keyboardType="numeric"
                  placeholder="1313.55"
                  placeholderTextColor={THEME.colors.textMuted}
                />
                <Text style={styles.captionBcv}>Calculado con tasa oficial BCV</Text>
              </View>

              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setEditingItem(null)}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalBtnSave}
                  onPress={handleSavePrice}
                >
                  <Text style={styles.modalBtnSaveText}>Actualizar Precio</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
    borderColor: THEME.colors.cardBorder,
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
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  summaryBadge: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.accentDark,
    borderWidth: 1,
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
  addFormBox: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    gap: 12,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  formTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accent,
    textTransform: 'uppercase',
  },
  formCloseText: {
    fontSize: 12,
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
  catPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  smallCatPill: {
    backgroundColor: '#0c0a09',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  smallCatPillActive: {
    borderColor: THEME.colors.accent,
    backgroundColor: THEME.colors.accentBg,
  },
  smallCatPillText: {
    fontSize: 9,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
  },
  smallCatPillTextActive: {
    color: THEME.colors.accentLight,
  },
  submitBtn: {
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0c0a09',
  },
  catSwitcher: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.card,
    padding: 3,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  catBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: THEME.radius.sm,
  },
  catBtnActive: {
    backgroundColor: THEME.colors.accent,
  },
  catBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  catBtnTextActive: {
    color: '#0c0a09',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  infoSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
  },
  infoInstruction: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  infoCount: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  listContainer: {
    gap: 8,
  },
  ingCard: {
    backgroundColor: '#161413',
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ingCardSelected: {
    backgroundColor: THEME.colors.card,
    borderColor: THEME.colors.cardBorderHighlight,
  },
  ingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  },
  checkboxActive: {
    backgroundColor: THEME.colors.accent,
    borderColor: THEME.colors.accent,
  },
  ingTextInfo: {
    flex: 1,
  },
  ingName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  presentationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0c0a09',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    marginTop: 4,
  },
  presentationText: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  ingRight: {
    alignItems: 'flex-end',
  },
  ingPriceVes: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.accent,
  },
  ingPriceUsd: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
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
    alignItems: 'flex-start',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  modalHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accent,
  },
  modalHeaderItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  modalCloseText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  captionBcv: {
    fontSize: 9,
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: '#0c0a09',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  modalBtnSave: {
    flex: 1,
    backgroundColor: THEME.colors.accent,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  modalBtnSaveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0c0a09',
  },
});
