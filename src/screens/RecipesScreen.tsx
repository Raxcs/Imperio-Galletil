import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { ChevronRight, ChevronLeft, Copy, Pencil, Plus, X, Undo2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { THEME } from '../theme';
import { Recipe, ExchangeRates, Ingredient, RecipeIngredient } from '../types';
import { SwipeableRow } from '../components/SwipeableRow';
import { calcPortionCost, getIngredientBase } from '../services/recipesService';
import { recipesRepo, syncNow } from '../data';
import { generateId } from '../lib/sync';

interface RecipesScreenProps {
  recipes: Recipe[];
  rates: ExchangeRates;
  ingredients: Ingredient[];
}

interface EditorIngredientRow {
  id: string;
  ing_id: string;
  used_qty: number;
  used_unit: string;
}

const AVAILABLE_UNITS = ['g', 'kg', 'un', 'ml'];

function generateRecipeId(): string {
  return generateId();
}

function generateRowId(): string {
  return 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

export const RecipesScreen: React.FC<RecipesScreenProps> = ({
  recipes,
  rates,
  ingredients,
}) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const selectedRecipe = recipes.find((r) => r.id === selectedRecipeId) || null;
  const [isEditingProcess, setIsEditingProcess] = useState(false);
  const [processEditText, setProcessEditText] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Undo (Deshacer) state - strictly 5 seconds
  const [deletedRecipeToUndo, setDeletedRecipeToUndo] = useState<Recipe | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Unified Recipe Editor Modal state (used for both Creating and Editing)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editorRecipeId, setEditorRecipeId] = useState<string | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorSubtitle, setEditorSubtitle] = useState('');
  const [editorYieldStr, setEditorYieldStr] = useState('20');
  const [editorProcess, setEditorProcess] = useState('');
  const [editorRows, setEditorRows] = useState<EditorIngredientRow[]>([]);
  const [activePickerRowId, setActivePickerRowId] = useState<string | null>(null);

  // Real-time calculated costs in editor (no manual price inputs)
  const editorYield = parseInt(editorYieldStr, 10) || 1;
  const editorBatchCostUsd = editorRows.reduce((sum, row) => {
    const matched = ingredients.find((i) => i.id === row.ing_id);
    return sum + calcPortionCost(matched, row.used_qty, row.used_unit);
  }, 0);
  const editorPackCostUsd = editorBatchCostUsd / Math.max(1, editorYield);
  const editorBatchCostVes = editorBatchCostUsd * rates.usd_ves;
  const editorPackCostVes = editorPackCostUsd * rates.usd_ves;

  const openCreateRecipeModal = () => {
    setEditorRecipeId(null);
    setEditorTitle('');
    setEditorSubtitle('');
    setEditorYieldStr('20');
    setEditorProcess('');

    // Pre-populate with first ingredients if available
    if (ingredients.length > 0) {
      const flour = ingredients.find((i) => i.name.toLowerCase().includes('harina')) || ingredients[0];
      const butter = ingredients.find((i) => i.name.toLowerCase().includes('mantequilla')) || ingredients[1] || ingredients[0];
      setEditorRows([
        { id: 'row_1', ing_id: flour.id, used_qty: 700, used_unit: 'g' },
        { id: 'row_2', ing_id: butter.id, used_qty: 200, used_unit: 'g' },
      ]);
    } else {
      setEditorRows([]);
    }

    setIsEditorModalOpen(true);
  };

  const openEditRecipeModal = (recipe: Recipe) => {
    setEditorRecipeId(recipe.id);
    setEditorTitle(recipe.title);
    setEditorSubtitle(recipe.subtitle);
    setEditorYieldStr(recipe.batch_yield.toString());
    setEditorProcess(recipe.process);

    // Map existing recipe ingredients to editor rows
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      const mappedRows: EditorIngredientRow[] = recipe.ingredients.map((item, idx) => {
        const searchTarget = (item.ingredient_name || item.name).toLowerCase().trim();
        const matched = ingredients.find(
          (i) => (item.ing_id && i.id === item.ing_id) || i.name.toLowerCase().trim() === searchTarget
        );
        const base = matched ? getIngredientBase(matched) : { base_qty: 1000, base_unit: 'g' };
        const usedQty = typeof item.used_qty === 'number' && item.used_qty > 0
          ? item.used_qty
          : (typeof item.ratio === 'number' && item.ratio > 0 ? Number((item.ratio * base.base_qty).toFixed(0)) : 100);

        return {
          id: generateRowId(),
          ing_id: matched ? matched.id : (ingredients[0]?.id || ''),
          used_qty: usedQty,
          used_unit: item.used_unit || base.base_unit || 'g',
        };
      });
      setEditorRows(mappedRows);
    } else if (ingredients.length > 0) {
      setEditorRows([{ id: 'row_0', ing_id: ingredients[0].id, used_qty: 500, used_unit: 'g' }]);
    } else {
      setEditorRows([]);
    }

    setIsEditorModalOpen(true);
  };

  const handleAddIngredientRow = () => {
    if (ingredients.length === 0) {
      Alert.alert('Sin insumos', 'Primero debes registrar insumos en la pestaña Insumos para agregarlos a la receta.');
      return;
    }
    const defaultIng = ingredients[0];
    const base = getIngredientBase(defaultIng);
    setEditorRows((prev) => [
      ...prev,
      {
        id: generateRowId(),
        ing_id: defaultIng.id,
        used_qty: 100,
        used_unit: base.base_unit || 'g',
      },
    ]);
  };

  const handleRemoveIngredientRow = (rowId: string) => {
    setEditorRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const handleRowQtyChange = (rowId: string, val: string) => {
    const qty = parseFloat(val) || 0;
    setEditorRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, used_qty: qty } : r))
    );
  };

  const handleRowUnitChange = (rowId: string, unit: string) => {
    setEditorRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, used_unit: unit } : r))
    );
  };

  const handleSelectRowIngredient = (rowId: string, ingId: string) => {
    const matched = ingredients.find((i) => i.id === ingId);
    const base = matched ? getIngredientBase(matched) : { base_qty: 1000, base_unit: 'g' };
    setEditorRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, ing_id: ingId, used_unit: base.base_unit || r.used_unit } : r))
    );
    setActivePickerRowId(null);
  };

  const handleSaveRecipeFromEditor = async () => {
    if (isSubmitting) return;

    const trimmedTitle = editorTitle.trim();
    const yieldNum = parseInt(editorYieldStr, 10) || 1;

    if (!trimmedTitle) {
      Alert.alert('Datos requeridos', 'Por favor ingresa un título para la receta.');
      return;
    }

    if (yieldNum <= 0) {
      Alert.alert('Datos requeridos', 'El rendimiento por tanda debe ser mayor a 0.');
      return;
    }

    setIsSubmitting(true);

    // Build ingredients list with exact portion math
    const builtIngredients: RecipeIngredient[] = editorRows
      .filter((r) => r.ing_id && r.used_qty > 0)
      .map((r) => {
        const matched = ingredients.find((i) => i.id === r.ing_id);
        const costUsd = calcPortionCost(matched, r.used_qty, r.used_unit);
        const costVes = Number((costUsd * rates.usd_ves).toFixed(2));
        const base = matched ? getIngredientBase(matched) : { base_qty: 1, base_unit: 'un' };
        const ratio = r.used_qty / (base.base_qty || 1);

        return {
          name: matched?.name || 'Insumo',
          amount: `${r.used_qty} ${r.used_unit}`,
          price_usd: costUsd,
          price_ves: costVes,
          ingredient_name: matched?.name,
          ing_id: r.ing_id,
          used_qty: r.used_qty,
          used_unit: r.used_unit,
          ratio: ratio,
        };
      });

    const finalBatchUsd = Number(editorBatchCostUsd.toFixed(2));
    const finalPackUsd = Number(editorPackCostUsd.toFixed(2));

    if (editorRecipeId) {
      // Editing existing recipe
      const existing = recipes.find((r) => r.id === editorRecipeId);
      const updatedRecipe: Recipe = {
        id: editorRecipeId,
        title: trimmedTitle,
        subtitle: editorSubtitle.trim() || 'Receta de la casa',
        batch_yield: yieldNum,
        batch_cost_usd: finalBatchUsd,
        pack_cost_usd: finalPackUsd,
        process: editorProcess.trim() || existing?.process || 'Pasos de preparación pendientes.',
        ingredients: builtIngredients,
      };

      try {
        await recipesRepo.upsert(updatedRecipe);
        setIsEditorModalOpen(false);
      } catch (err) {
        console.warn('Error updating recipe', err);
        Alert.alert('No se pudo guardar', 'Intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Creating new recipe
      const newRecipe: Recipe = {
        id: generateRecipeId(),
        title: trimmedTitle,
        subtitle: editorSubtitle.trim() || 'Receta de la casa',
        batch_yield: yieldNum,
        batch_cost_usd: finalBatchUsd,
        pack_cost_usd: finalPackUsd,
        process: editorProcess.trim() || 'Pasos de preparación pendientes por definir.',
        ingredients: builtIngredients,
      };

      try {
        await recipesRepo.upsert(newRecipe);
        setIsEditorModalOpen(false);
      } catch (err) {
        console.warn('Error creating recipe', err);
        Alert.alert('No se pudo guardar', 'Intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncNow();
    } catch (err) {
      console.warn('Error refreshing recipes', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const openRecipeModal = (recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    setProcessEditText(recipe.process);
    setIsEditingProcess(false);
    setCopyFeedback(false);
  };

  const closeRecipeModal = () => {
    setSelectedRecipeId(null);
    setIsEditingProcess(false);
  };

  const handleCopyProcess = async () => {
    if (!selectedRecipe) return;
    await Clipboard.setStringAsync(selectedRecipe.process);
    setCopyFeedback(true);
    setTimeout(() => {
      setCopyFeedback(false);
    }, 2000);
  };

  const handleSaveProcess = async () => {
    if (!selectedRecipe) return;
    const trimmed = processEditText.trim();
    if (!trimmed) {
      Alert.alert('Proceso vacío', 'Por favor ingresa los pasos de preparación.');
      return;
    }

    const updatedRecipe: Recipe = {
      ...selectedRecipe,
      process: trimmed,
    };

    setIsEditingProcess(false);
    await recipesRepo.upsert(updatedRecipe);
  };

  const handleDeleteRecipe = (recipeId: string) => {
    const recipeToDelete = recipes.find((r) => r.id === recipeId);
    if (!recipeToDelete) return;

    if (selectedRecipeId === recipeId) {
      setSelectedRecipeId(null);
    }

    // Provide Undo state
    setDeletedRecipeToUndo(recipeToDelete);

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // The delete is persisted right away (tombstone); the 5 second window only controls the
    // undo banner, and undo restores the same record.
    recipesRepo.remove(recipeId).catch((err) => console.warn('Error deleting recipe', err));
    undoTimerRef.current = setTimeout(() => {
      setDeletedRecipeToUndo(null);
    }, 5000);
  };

  const handleUndoDelete = async () => {
    if (!deletedRecipeToUndo) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const itemToRestore = deletedRecipeToUndo;
    setDeletedRecipeToUndo(null);

    await recipesRepo.restore(itemToRestore.id);
  };

  return (
    <View style={styles.screenWrapper}>
      {/* Page Header matching simulation.html */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Recetario</Text>
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
        {/* Recipe Cards List */}

        {/* Recipe Cards List */}
        <View style={styles.recipesList}>
          {recipes.map((recipe) => {
            const batchCostVes = recipe.batch_cost_usd * rates.usd_ves;
            const packCostVes = recipe.pack_cost_usd * rates.usd_ves;

            return (
              <SwipeableRow
                key={recipe.id}
                onDelete={() => handleDeleteRecipe(recipe.id)}
                deleteLabel="Eliminar"
              >
                <TouchableOpacity
                  style={styles.recipeCard}
                  onPress={() => openRecipeModal(recipe)}
                  activeOpacity={0.8}
                >
                  <View style={styles.recipeCardHeader}>
                    <View style={styles.recipeCardTitles}>
                      <Text style={styles.recipeCardTitle}>{recipe.title}</Text>
                      <Text style={styles.recipeCardSubtitle}>{recipe.subtitle}</Text>
                    </View>
                    <View style={styles.chevronBox}>
                      <ChevronRight size={16} color={THEME.colors.accent} strokeWidth={2.4} />
                    </View>
                  </View>

                  <View style={styles.costsGrid}>
                    <View style={styles.costItem}>
                      <Text style={styles.costLabel}>COSTO POR TANDA</Text>
                      <Text style={styles.costMainVes}>
                        Bs. {batchCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={styles.costSubUsd}>
                        ${recipe.batch_cost_usd.toFixed(2)} USD
                      </Text>
                    </View>

                    <View style={styles.costItem}>
                      <Text style={styles.costLabel}>COSTO POR PACK</Text>
                      <Text style={[styles.costMainVes, { color: THEME.colors.accent }]}>
                        Bs. {packCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={styles.costSubUsd}>
                        ${recipe.pack_cost_usd.toFixed(2)} USD
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </SwipeableRow>
            );
          })}
        </View>
      </ScrollView>

      {/* Floating Action Button (New Recipe) */}
      <TouchableOpacity
        style={styles.fabBtn}
        onPress={openCreateRecipeModal}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Plus size={24} color="#09090b" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Detail Recipe Modal (Bóveda Bottom Sheet) */}
      {selectedRecipe && (
        <Modal
          visible={!!selectedRecipeId}
          transparent
          animationType="slide"
          onRequestClose={closeRecipeModal}
        >
          <View style={styles.sheetOverlay}>
            <TouchableOpacity
              style={styles.sheetBackdropDismiss}
              activeOpacity={1}
              onPress={closeRecipeModal}
            />
            <View style={styles.recipeDetailSheetBox}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.sheetHeaderTitle}>{selectedRecipe.title}</Text>
                  <Text style={styles.sheetHeaderSub}>{selectedRecipe.subtitle}</Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={closeRecipeModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <X size={16} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.recipeDetailScroll}
                contentContainerStyle={styles.recipeDetailContent}
                showsVerticalScrollIndicator={false}
              >

              {/* General Costs Breakdown */}
              <View style={styles.metricsRow}>
                {/* Costo por Tanda */}
                <View style={styles.metricCard}>
                  <View>
                    <Text style={styles.metricLabel}>COSTO POR TANDA</Text>
                    <Text style={styles.metricValueVes}>
                      Bs. {(selectedRecipe.batch_cost_usd * rates.usd_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={styles.metricValueUsd}>
                      ${selectedRecipe.batch_cost_usd.toFixed(2)} USD
                    </Text>
                  </View>
                  <View style={styles.badgeWrapper}>
                    <View style={styles.yieldBadge}>
                      <Text style={styles.yieldBadgeText}>
                        {selectedRecipe.batch_yield} packs por tanda
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Costo por Pack */}
                <View style={styles.metricCard}>
                  <View>
                    <Text style={styles.metricLabel}>COSTO POR PACK</Text>
                    <Text style={[styles.metricValueVes, { color: THEME.colors.accent }]}>
                      Bs. {(selectedRecipe.pack_cost_usd * rates.usd_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={styles.metricValueUsd}>
                      ${selectedRecipe.pack_cost_usd.toFixed(2)} USD
                    </Text>
                  </View>
                  <View style={styles.badgeWrapper}>
                    <Text style={styles.unitCaption}>Unidad individual</Text>
                  </View>
                </View>
              </View>

              {/* Ingredients Breakdown */}
              <View style={styles.sectionCard}>
                <View style={styles.processHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Insumos y Medidas</Text>
                    <Text style={styles.sectionSubtitle}>Costeo porcional automático</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.actionBtnSmall}
                    onPress={() => openEditRecipeModal(selectedRecipe)}
                    activeOpacity={0.7}
                  >
                    <Pencil size={13} color={THEME.colors.accent} strokeWidth={2} />
                    <Text style={styles.actionBtnSmallText}>Editar Receta</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.ingredientsList}>
                  {selectedRecipe.ingredients.map((ing, idx) => {
                    const priceVesFormatted = ing.price_ves > 0
                      ? `Bs. ${ing.price_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'Incluida';
                    const priceUsdFormatted = ing.price_usd > 0
                      ? `$${ing.price_usd.toFixed(2)} USD`
                      : '';

                    // Find catalog presentation info
                    const matchedCatalog = ingredients.find((i) => i.id === ing.ing_id || i.name.toLowerCase() === ing.name.toLowerCase());
                    const presInfo = matchedCatalog ? ` · Base: ${matchedCatalog.presentation}` : '';

                    return (
                      <View key={idx} style={styles.ingredientRow}>
                        <View style={styles.ingredientInfo}>
                          <Text style={styles.ingredientName}>{ing.name}</Text>
                          <Text style={styles.ingredientAmount}>
                            {ing.amount} <Text style={{ color: THEME.colors.textMuted }}>{presInfo}</Text>
                          </Text>
                        </View>
                        <View style={styles.ingredientPrices}>
                          <Text style={styles.ingPriceVes}>{priceVesFormatted}</Text>
                          {!!priceUsdFormatted && (
                            <Text style={styles.ingPriceUsd}>{priceUsdFormatted}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.ingredientsTotalRow}>
                  <Text style={styles.totalLabel}>Total Insumos Tanda</Text>
                  <Text style={styles.totalValue}>
                    Bs. {(selectedRecipe.batch_cost_usd * rates.usd_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${selectedRecipe.batch_cost_usd.toFixed(2)} USD)
                  </Text>
                </View>
              </View>

              {/* Preparation Process */}
              <View style={styles.sectionCard}>
                <View style={styles.processHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Proceso de Elaboración</Text>
                    <Text style={styles.sectionSubtitle}>Pasos de preparación de la tanda</Text>
                  </View>
                  <View style={styles.processActionButtons}>
                    <TouchableOpacity
                      style={styles.actionBtnSmall}
                      onPress={handleCopyProcess}
                      activeOpacity={0.7}
                    >
                      <Copy size={13} color={THEME.colors.accent} strokeWidth={2} />
                      <Text style={styles.actionBtnSmallText}>
                        {copyFeedback ? 'Copiado' : 'Copiar'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtnSmall, isEditingProcess && styles.actionBtnActive]}
                      onPress={() => setIsEditingProcess(!isEditingProcess)}
                      activeOpacity={0.7}
                    >
                      <Pencil size={13} color={THEME.colors.accent} strokeWidth={2} />
                      <Text style={styles.actionBtnSmallText}>
                        {isEditingProcess ? 'Viendo' : 'Editar Pasos'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {!isEditingProcess ? (
                  <View style={styles.processViewBox}>
                    <Text style={styles.processViewText}>{selectedRecipe.process}</Text>
                  </View>
                ) : (
                  <View style={styles.processEditBox}>
                    <TextInput
                      style={styles.processTextInput}
                      value={processEditText}
                      onChangeText={setProcessEditText}
                      multiline
                      numberOfLines={8}
                      textAlignVertical="top"
                      placeholder="Escribe o pega aquí los pasos de preparación..."
                      placeholderTextColor={THEME.colors.textMuted}
                    />
                    <View style={styles.processEditActions}>
                      <TouchableOpacity
                        style={styles.btnCancelEdit}
                        onPress={() => {
                          setProcessEditText(selectedRecipe.process);
                          setIsEditingProcess(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnCancelEditText}>Cancelar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnSaveEdit}
                        onPress={handleSaveProcess}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.btnSaveEditText}>Guardar Pasos</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* Back to list button */}
              <TouchableOpacity
                style={styles.bottomCloseBtn}
                onPress={closeRecipeModal}
                activeOpacity={0.7}
              >
                <Text style={styles.bottomCloseBtnText}>Cerrar Receta</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    )}

      {/* Unified Recipe Editor Modal (New / Edit) - Bóveda Bottom Sheet */}
      <Modal
        visible={isEditorModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditorModalOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdropDismiss}
            activeOpacity={1}
            onPress={() => setIsEditorModalOpen(false)}
          />
          <View style={styles.recipeEditorSheetBox}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetHeaderTitle}>
                {editorRecipeId ? `Editar Receta` : `Nueva Receta`}
              </Text>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setIsEditorModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <X size={16} color={THEME.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Título de la receta</Text>
                <TextInput
                  style={styles.input}
                  value={editorTitle}
                  onChangeText={setEditorTitle}
                  placeholder="Ej: Galletas Red Velvet"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Descripción breve</Text>
                <TextInput
                  style={styles.input}
                  value={editorSubtitle}
                  onChangeText={setEditorSubtitle}
                  placeholder="Ej: Receta artesanal de la casa"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Rendimiento (packs por tanda)</Text>
                <TextInput
                  style={styles.input}
                  value={editorYieldStr}
                  onChangeText={setEditorYieldStr}
                  keyboardType="numeric"
                  placeholder="20"
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              {/* Real-time Calculated Cost Banner (No manual inputs for price) */}
              <View style={styles.editorCostBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costBannerLabel}>COSTO TANDA (AUTOMÁTICO)</Text>
                  <Text style={styles.costBannerValMain}>${editorBatchCostUsd.toFixed(2)} USD</Text>
                  <Text style={styles.costBannerValSub}>
                    Bs. {editorBatchCostVes.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.costBannerLabel}>COSTO POR PACK</Text>
                  <Text style={[styles.costBannerValMain, { color: THEME.colors.accent }]}>
                    ${editorPackCostUsd.toFixed(2)} USD
                  </Text>
                  <Text style={styles.costBannerValSub}>
                    Bs. {editorPackCostVes.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>

              {/* Insumos Section */}
              <View style={styles.fieldWrapper}>
                <View style={styles.editorIngredientsHeader}>
                  <View>
                    <Text style={styles.label}>Insumos y Cantidad Usada</Text>
                    <Text style={styles.editorIngredientsSub}>
                      El costo se calcula con el precio que tienes en Insumos
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addIngRowBtn}
                    onPress={handleAddIngredientRow}
                    activeOpacity={0.8}
                  >
                    <Plus size={12} color="#09090b" strokeWidth={2.6} />
                    <Text style={styles.addIngRowBtnText}>Añadir</Text>
                  </TouchableOpacity>
                </View>

                {/* Rows list */}
                {editorRows.length === 0 ? (
                  <View style={styles.emptyRowsBox}>
                    <Text style={styles.emptyRowsText}>
                      Toca en &quot;+ Añadir&quot; para seleccionar insumos del catálogo
                    </Text>
                  </View>
                ) : (
                  editorRows.map((row) => {
                    const matched = ingredients.find((i) => i.id === row.ing_id);
                    const portionCost = calcPortionCost(matched, row.used_qty, row.used_unit);

                    return (
                      <View key={row.id} style={styles.ingPortionRow}>
                        {/* Top Row: Ingredient selector + Delete button */}
                        <View style={styles.ingPortionTopRow}>
                          <TouchableOpacity
                            style={styles.ingSelectBtn}
                            onPress={() => setActivePickerRowId(row.id)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.ingSelectBtnTitle} numberOfLines={1}>
                              {matched ? matched.name : 'Seleccionar insumo...'}
                            </Text>
                            <Text style={styles.ingSelectBtnSub} numberOfLines={1}>
                              {matched ? `$${matched.price_usd.toFixed(2)} / ${matched.presentation}` : 'Toca para elegir'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.delRowBtn}
                            onPress={() => handleRemoveIngredientRow(row.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                          >
                            <X size={15} color={THEME.colors.textMuted} />
                          </TouchableOpacity>
                        </View>

                        {/* Bottom Row: Quantity input + Unit selector pills + Cost badge */}
                        <View style={styles.ingPortionBottomRow}>
                          <TextInput
                            style={styles.ingQtyInput}
                            value={row.used_qty > 0 ? String(row.used_qty) : ''}
                            onChangeText={(val) => handleRowQtyChange(row.id, val)}
                            keyboardType="numeric"
                            placeholder="100"
                            placeholderTextColor={THEME.colors.textMuted}
                          />

                          <View style={styles.unitPillsRow}>
                            {AVAILABLE_UNITS.map((u) => {
                              const isSelected = row.used_unit === u;
                              return (
                                <TouchableOpacity
                                  key={u}
                                  style={[styles.unitPill, isSelected && styles.unitPillActive]}
                                  onPress={() => handleRowUnitChange(row.id, u)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.unitPillText, isSelected && styles.unitPillTextActive]}>
                                    {u}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <View style={styles.portionCostBadge}>
                            <Text style={styles.portionCostBadgeText}>${portionCost.toFixed(2)} USD</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Pasos de preparación</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editorProcess}
                  onChangeText={setEditorProcess}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholder="Escribe aquí las instrucciones o pasos clave..."
                  placeholderTextColor={THEME.colors.textMuted}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveRecipeBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSaveRecipeFromEditor}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.saveRecipeBtnText}>
                  {isSubmitting ? 'Guardando...' : (editorRecipeId ? 'Guardar Cambios' : 'Guardar Receta')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Ingredient Picker Sheet for Editor Rows - Bóveda Bottom Sheet */}
      <Modal
        visible={!!activePickerRowId}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePickerRowId(null)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdropDismiss}
            activeOpacity={1}
            onPress={() => setActivePickerRowId(null)}
          />
          <View style={[styles.recipeEditorSheetBox, { maxHeight: '80%' }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetHeaderTitle}>Seleccionar Insumo</Text>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setActivePickerRowId(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <X size={16} color={THEME.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {ingredients.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.pickerItemRow}
                  onPress={() => activePickerRowId && handleSelectRowIngredient(activePickerRowId, item.id)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemName}>{item.name}</Text>
                    <Text style={styles.pickerItemSub}>
                      {item.presentation} · Bs. {item.price_ves.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <Text style={styles.pickerItemPrice}>${item.price_usd.toFixed(2)} USD</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Floating Undo (Deshacer) Banner */}
      {deletedRecipeToUndo && (
        <View style={styles.undoSnackbar}>
          <View style={styles.undoTextWrapper}>
            <Text style={styles.undoSnackbarTitle} numberOfLines={1}>
              {`Receta "${deletedRecipeToUndo.title}" eliminada`}
            </Text>
            <Text style={styles.undoSnackbarSub}>Se borrará permanentemente en 5s</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    position: 'relative',
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
  },
  contentContainer: {
    padding: 16,
    paddingTop: 8,
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
  headerInfo: {
    paddingHorizontal: 2,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.8,
  },
  headerDesc: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  recipesList: {
    gap: 10,
  },
  recipeCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 16,
  },
  recipeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recipeCardTitles: {
    flex: 1,
    marginRight: 8,
  },
  recipeCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  recipeCardSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  chevronBox: {
    width: 26,
    height: 26,
    borderRadius: THEME.radius.sm,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  costsGrid: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
    gap: 12,
  },
  costItem: {
    flex: 1,
  },
  costLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    marginBottom: 3,
  },
  costMainVes: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  costSubUsd: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetBackdropDismiss: {
    ...StyleSheet.absoluteFill,
  },
  recipeDetailSheetBox: {
    backgroundColor: THEME.colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 24,
  },
  recipeEditorSheetBox: {
    backgroundColor: THEME.colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
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
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  sheetHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  sheetHeaderSub: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    marginTop: 2,
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
  recipeDetailScroll: {
    flexGrow: 0,
  },
  recipeDetailContent: {
    gap: 14,
    paddingBottom: 20,
  },
  recipeCostCard: {
    backgroundColor: THEME.colors.cardElevated,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderSubtle,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 12,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginBottom: 3,
  },
  metricValueVes: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  metricValueUsd: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  badgeWrapper: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
  },
  yieldBadge: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.cardBorderHighlight,
    borderWidth: 1,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  yieldBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accentLight,
  },
  unitCaption: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    paddingVertical: 3,
  },
  sectionCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  ingredientsList: {},
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  ingredientInfo: {
    flex: 1,
    paddingRight: 8,
  },
  ingredientName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  ingredientAmount: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.accent,
    marginTop: 1,
  },
  ingredientPrices: {
    alignItems: 'flex-end',
  },
  ingPriceVes: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ingPriceUsd: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  ingredientsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accent,
  },
  totalValue: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accent,
    fontVariant: ['tabular-nums'],
  },
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  processActionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: THEME.radius.sm,
  },
  actionBtnActive: {
    borderColor: THEME.colors.accent,
  },
  actionBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  processViewBox: {
    backgroundColor: '#09090b',
    padding: 12,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  processViewText: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
  },
  processEditBox: {
    gap: 8,
  },
  processTextInput: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.md,
    padding: 12,
    fontSize: 12,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
    minHeight: 140,
  },
  processEditActions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnCancelEdit: {
    flex: 1,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingVertical: 9,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  btnCancelEditText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  btnSaveEdit: {
    flex: 1,
    backgroundColor: THEME.colors.accent,
    paddingVertical: 9,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  btnSaveEditText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#09090b',
  },
  bottomCloseBtn: {
    backgroundColor: THEME.colors.card,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  bottomCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  // Modal Editor
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  createModalBox: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
  },
  createModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  createModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  fieldWrapper: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 4,
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
  textArea: {
    minHeight: 70,
  },
  editorCostBanner: {
    backgroundColor: THEME.colors.cardElevated,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderSubtle,
    borderRadius: THEME.radius.md,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  costBannerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  costBannerValMain: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  costBannerValSub: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  editorIngredientsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editorIngredientsSub: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 1,
  },
  addIngRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.radius.sm,
  },
  addIngRowBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#09090b',
  },
  emptyRowsBox: {
    padding: 14,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    alignItems: 'center',
    backgroundColor: '#09090b',
  },
  emptyRowsText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  ingPortionRow: {
    backgroundColor: '#09090b',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  ingPortionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ingSelectBtn: {
    flex: 1,
    paddingRight: 4,
  },
  ingSelectBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  ingSelectBtnSub: {
    fontSize: 11,
    color: THEME.colors.accent,
    marginTop: 2,
  },
  delRowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingPortionBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  ingQtyInput: {
    width: 64,
    height: 34,
    backgroundColor: '#18181b',
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  unitPillsRow: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: THEME.radius.sm,
    padding: 2,
    gap: 3,
  },
  unitPill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
  },
  unitPillActive: {
    backgroundColor: THEME.colors.accent,
  },
  unitPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  unitPillTextActive: {
    color: '#09090b',
    fontWeight: '800',
  },
  portionCostBadge: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  portionCostBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accentLight,
    fontVariant: ['tabular-nums'],
  },
  saveRecipeBtn: {
    backgroundColor: THEME.colors.accent,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  saveRecipeBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090b',
  },
  pickerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  pickerItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  pickerItemSub: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  pickerItemPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accent,
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
});
