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
import { Plus, Check, X, Pencil, Undo2 } from 'lucide-react-native';
import { THEME } from '../theme';
import { Ingredient, ExchangeRates } from '../types';
import { SwipeableRow } from '../components/SwipeableRow';
import {
  fetchIngredients,
  createIngredientInBackend,
  updateIngredientInBackend,
  deleteIngredientInBackend,
  restoreIngredientInBackend,
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

  // Edit ingredient modal state (full edit: name, presentation, cat, prices, delete)
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [editName, setEditName] = useState('');
  const [editPresentation, setEditPresentation] = useState('');
  const [editCat, setEditCat] = useState<'galletas' | 'brownies' | 'empaques' | 'ambos'>('galletas');
  const [editPriceUsd, setEditPriceUsd] = useState('');
  const [editPriceVes, setEditPriceVes] = useState('');

  // Undo (Deshacer) state
  const [deletedIngToUndo, setDeletedIngToUndo] = useState<Ingredient | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleOpenEdit = (item: Ingredient) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditPresentation(item.presentation);
    const cat = item.category.length > 1 ? 'ambos' : (item.category[0] as any) || 'galletas';
    setEditCat(cat);
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
    setEditPriceUsd(num > 0 && rates.usd_ves > 0 ? (num / rates.usd_ves).toFixed(2) : '');
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const trimmedName = editName.trim();
    const finalUsd = parseFloat(editPriceUsd) || 0;
    const finalVes = parseFloat(editPriceVes) || 0;

    if (!trimmedName) {
      Alert.alert('Nombre requerido', 'Por favor ingresa un nombre para el insumo.');
      return;
    }

    if (finalUsd <= 0 && finalVes <= 0) {
      Alert.alert('Precio invalido', 'Por favor ingresa un precio valido.');
      return;
    }

    const calculatedUsd = finalUsd > 0 ? finalUsd : rates.usd_ves > 0 ? finalVes / rates.usd_ves : 0;
    const calculatedVes = finalVes > 0 ? finalVes : finalUsd * rates.usd_ves;
    const cats = editCat === 'ambos' ? ['galletas', 'brownies'] : [editCat];

    const updatedItem: Ingredient = {
      ...editingItem,
      name: trimmedName,
      presentation: editPresentation.trim() || 'Unidad',
      category: cats,
      price_usd: calculatedUsd,
      price_ves: calculatedVes,
    };

    const updated = ingredients.map((i) =>
      i.id === editingItem.id ? updatedItem : i
    );

    onIngredientsUpdated(updated);
    await setCachedIngredients(updated);
    await updateIngredientInBackend(updatedItem);
    setEditingItem(null);
  };

  const handleDeleteIngredientItem = (itemToDelete: Ingredient) => {
    const idToDelete = itemToDelete.id;

    if (editingItem?.id === idToDelete) {
      setEditingItem(null);
    }

    // Immediately remove from UI and cache
    const updated = ingredients.filter((i) => i.id !== idToDelete);
    onIngredientsUpdated(updated);
    setCachedIngredients(updated);

    // Provide Undo state
    setDeletedIngToUndo(itemToDelete);

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // Strictly 5-second grace period before permanent deletion in backend
    undoTimerRef.current = setTimeout(async () => {
      await deleteIngredientInBackend(idToDelete, itemToDelete);
      setDeletedIngToUndo(null);
    }, 5000);
  };

  const handleUndoDelete = async () => {
    if (!deletedIngToUndo) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const itemToRestore = deletedIngToUndo;
    setDeletedIngToUndo(null);

    const restored = [itemToRestore, ...ingredients];
    onIngredientsUpdated(restored);
    await setCachedIngredients(restored);
    await restoreIngredientInBackend(itemToRestore.id, itemToRestore);
  };

  const handleNewUsdChange = (val: string) => {
    setNewPriceUsd(val);
    const num = parseFloat(val) || 0;
    setNewPriceVes(num > 0 ? (num * rates.usd_ves).toFixed(2) : '');
  };

  const handleNewVesChange = (val: string) => {
    setNewPriceVes(val);
    const num = parseFloat(val) || 0;
    setNewPriceUsd(num > 0 && rates.usd_ves > 0 ? (num / rates.usd_ves).toFixed(2) : '');
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

    const calculatedUsd = finalUsd > 0 ? finalUsd : rates.usd_ves > 0 ? finalVes / rates.usd_ves : 0;
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

    const itemToAdd = await createIngredientInBackend(newItemData);

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
        {/* Top Banner: Total Seleccionado (solo si hay insumos marcados) */}
        {selectedIngredients.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <Text style={styles.summaryTitle}>TOTAL COMPRA MARCADA</Text>
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
                activeOpacity={0.7}
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
            <Text style={styles.infoInstruction}>Toca el lapiz o manten presionado para editar o borrar</Text>
          </View>
          <Text style={styles.infoCount}>
            {filteredList.length} {filteredList.length === 1 ? 'articulo' : 'articulos'}
          </Text>
        </View>

        {/* Ingredients List */}
        <View style={styles.listContainer}>
          {filteredList.map((item) => (
            <SwipeableRow
              key={item.id}
              onDelete={() => handleDeleteIngredientItem(item)}
              deleteLabel="Eliminar"
            >
              <TouchableOpacity
                style={[styles.ingCard, item.selected && styles.ingCardSelected]}
                onPress={() => toggleSelection(item.id)}
                onLongPress={() => handleOpenEdit(item)}
                delayLongPress={400}
                activeOpacity={0.85}
              >
                <View style={styles.ingLeft}>
                  <TouchableOpacity
                    style={[styles.checkbox, item.selected && styles.checkboxActive]}
                    onPress={() => toggleSelection(item.id)}
                    activeOpacity={0.7}
                  >
                    {item.selected && <Check size={13} color="#09090b" strokeWidth={3} />}
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

                  <TouchableOpacity
                    style={styles.editIconBtn}
                    onPress={() => handleOpenEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Pencil size={12} color={THEME.colors.textMuted} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          ))}
        </View>
      </ScrollView>

      {/* Floating Action Button para Registrar Insumo */}
      <TouchableOpacity
        style={styles.fabBtn}
        onPress={() => setIsAddFormVisible(true)}
        activeOpacity={0.85}
      >
        <Plus size={24} color="#09090b" strokeWidth={2.6} />
      </TouchableOpacity>

      {/* Undo (Deshacer) Floating Snackbar */}
      {deletedIngToUndo && (
        <View style={styles.undoSnackbar}>
          <View style={styles.undoTextWrapper}>
            <Text style={styles.undoSnackbarTitle} numberOfLines={1}>
              Insumo {deletedIngToUndo.name} eliminado
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

      {/* Edit Ingredient Modal (Full edit + Delete) */}
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
                <Text style={styles.modalTitle}>Editar Insumo</Text>
                <TouchableOpacity onPress={() => setEditingItem(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={18} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Nombre del insumo</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Ejemplo: Harina de trigo"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              <View style={styles.rowFields}>
                <View style={[styles.fieldWrapper, { flex: 1 }]}>
                  <Text style={styles.label}>Presentacion</Text>
                  <TextInput
                    style={styles.input}
                    value={editPresentation}
                    onChangeText={setEditPresentation}
                    placeholder="Ej: Paquete de 1 kg"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>

                <View style={[styles.fieldWrapper, { flex: 1 }]}>
                  <Text style={styles.label}>Categoria</Text>
                  <View style={styles.catPillRow}>
                    {(['galletas', 'brownies', 'empaques', 'ambos'] as const).map((c) => {
                      const isSelected = editCat === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[styles.smallCatPill, isSelected && styles.smallCatPillActive]}
                          onPress={() => setEditCat(c)}
                          activeOpacity={0.7}
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
                    value={editPriceUsd}
                    onChangeText={handleEditUsdChange}
                    keyboardType="numeric"
                    placeholder="1.50"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>

                <View style={[styles.fieldWrapper, { flex: 1 }]}>
                  <Text style={styles.label}>Precio Bolivares (VES)</Text>
                  <TextInput
                    style={styles.input}
                    value={editPriceVes}
                    onChangeText={handleEditVesChange}
                    keyboardType="numeric"
                    placeholder="131.35"
                    placeholderTextColor={THEME.colors.textMuted}
                  />
                </View>
              </View>


              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSaveEdit}
                activeOpacity={0.8}
              >
                <Text style={styles.submitBtnText}>Guardar Cambios</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal para Registrar Nuevo Insumo */}
      <Modal
        visible={isAddFormVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddFormVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Insumo</Text>
              <TouchableOpacity onPress={() => setIsAddFormVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={THEME.colors.textMuted} />
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
                  placeholder="Ej: Pote 100g"
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
                        activeOpacity={0.7}
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
                  placeholder="131.35"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSaveNewIngredient} activeOpacity={0.8}>
              <Text style={styles.submitBtnText}>Guardar Insumo</Text>
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
  summaryBadge: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.cardBorderHighlight,
    borderWidth: 1,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accentLight,
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
  catSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#09090b',
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
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  catBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  catBtnTextActive: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  infoSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ingCardSelected: {
    borderColor: THEME.colors.cardBorderHighlight,
    backgroundColor: '#18181c',
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
    backgroundColor: '#09090b',
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
    backgroundColor: '#09090b',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    marginTop: 3,
  },
  presentationText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
  ingRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  ingPriceVes: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ingPriceUsd: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  editIconBtn: {
    padding: 3,
    marginTop: 2,
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
    fontSize: 14,
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
  catPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  smallCatPill: {
    backgroundColor: '#09090b',
    paddingHorizontal: 6,
    paddingVertical: 5,
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
    color: THEME.colors.textMuted,
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
