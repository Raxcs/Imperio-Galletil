import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { ChevronRight, ChevronLeft, Copy, Pencil } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { THEME } from '../theme';
import { Recipe, ExchangeRates } from '../types';
import {
  updateRecipeProcessInBackend,
  setCachedRecipes,
} from '../services/recipesService';

interface RecipesScreenProps {
  recipes: Recipe[];
  rates: ExchangeRates;
  onRecipesUpdated: (recipes: Recipe[]) => void;
}

export const RecipesScreen: React.FC<RecipesScreenProps> = ({
  recipes,
  rates,
  onRecipesUpdated,
}) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const selectedRecipe = recipes.find((r) => r.id === selectedRecipeId) || null;
  const [isEditingProcess, setIsEditingProcess] = useState(false);
  const [processEditText, setProcessEditText] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

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
      Alert.alert('Proceso vacio', 'Por favor ingresa los pasos de preparacion.');
      return;
    }

    const updatedRecipe: Recipe = {
      ...selectedRecipe,
      process: trimmed,
    };

    const newRecipes = recipes.map((r) =>
      r.id === selectedRecipe.id ? updatedRecipe : r
    );

    setIsEditingProcess(false);
    onRecipesUpdated(newRecipes);
    await setCachedRecipes(newRecipes);
    await updateRecipeProcessInBackend(selectedRecipe.id, trimmed);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      {/* Header Info */}
      <View style={styles.headerInfo}>
        <Text style={styles.headerSubtitle}>RECETARIO Y ESCANDALLO</Text>
        <Text style={styles.headerDesc}>Toca cualquier receta para ver detalles e ingredientes</Text>
      </View>

      {/* Recipe Cards List */}
      <View style={styles.recipesList}>
        {recipes.map((recipe) => {
          const batchCostVes = recipe.batch_cost_usd * rates.usd_ves;
          const packCostVes = recipe.pack_cost_usd * rates.usd_ves;

          return (
            <TouchableOpacity
              key={recipe.id}
              style={styles.recipeCard}
              onPress={() => openRecipeModal(recipe)}
              activeOpacity={0.8}
            >
              <View style={styles.recipeCardHeader}>
                <View>
                  <Text style={styles.recipeCardTitle}>{recipe.title}</Text>
                  <Text style={styles.recipeCardSubtitle}>{recipe.subtitle}</Text>
                </View>
                <View style={styles.chevronBox}>
                  <ChevronRight size={18} color={THEME.colors.accent} strokeWidth={2.5} />
                </View>
              </View>

              <View style={styles.costsGrid}>
                <View style={styles.costItem}>
                  <Text style={styles.costLabel}>COSTO POR TANDA</Text>
                  <Text style={styles.costMainVes}>
                    Bs. {batchCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.costSubUsd}>
                    ${recipe.batch_cost_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </Text>
                </View>

                <View style={styles.costItem}>
                  <Text style={styles.costLabel}>COSTO POR PACK</Text>
                  <Text style={[styles.costMainVes, { color: THEME.colors.accent }]}>
                    Bs. {packCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.costSubUsd}>
                    ${recipe.pack_cost_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Recipe Details Full Modal */}
      {selectedRecipe && (
        <Modal
          visible={!!selectedRecipe}
          animationType="slide"
          onRequestClose={closeRecipeModal}
        >
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalNavHeader}>
              <TouchableOpacity style={styles.backButton} onPress={closeRecipeModal}>
                <ChevronLeft size={20} color={THEME.colors.accent} strokeWidth={2.5} />
                <Text style={styles.backButtonText}>Volver a Recetas</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Recipe Titles */}
              <View style={styles.recipeTitleSection}>
                <Text style={styles.modalRecipeTitle}>{selectedRecipe.title}</Text>
                <Text style={styles.modalRecipeSubtitle}>{selectedRecipe.subtitle}</Text>
              </View>

              {/* Metrics Grid */}
              <View style={styles.metricsRow}>
                {/* Costo por Tanda with Yield Badge directly below */}
                <View style={styles.metricCard}>
                  <View>
                    <Text style={styles.metricLabel}>COSTO POR TANDA</Text>
                    <Text style={styles.metricValueVes}>
                      Bs. {(selectedRecipe.batch_cost_usd * rates.usd_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={styles.metricValueUsd}>
                      ${selectedRecipe.batch_cost_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
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
                      ${selectedRecipe.pack_cost_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </Text>
                  </View>
                  <View style={styles.badgeWrapper}>
                    <Text style={styles.unitCaption}>Unidad individual</Text>
                  </View>
                </View>
              </View>

              {/* Ingredients Breakdown */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Ingredientes de la Tanda</Text>
                <View style={styles.ingredientsList}>
                  {selectedRecipe.ingredients.map((ing, idx) => {
                    const priceVesFormatted = ing.price_ves > 0
                      ? `Bs. ${ing.price_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'Incluida';
                    const priceUsdFormatted = ing.price_usd > 0
                      ? `$${ing.price_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                      : '';

                    return (
                      <View key={idx} style={styles.ingredientRow}>
                        <View style={styles.ingredientInfo}>
                          <Text style={styles.ingredientName}>{ing.name}</Text>
                          <Text style={styles.ingredientAmount}>{ing.amount}</Text>
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
                    Bs. {(selectedRecipe.batch_cost_usd * rates.usd_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${selectedRecipe.batch_cost_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)
                  </Text>
                </View>
              </View>

              {/* Preparation Process */}
              <View style={styles.sectionCard}>
                <View style={styles.processHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Proceso de Elaboracion</Text>
                    <Text style={styles.sectionSubtitle}>Pasos de preparacion de la tanda</Text>
                  </View>
                  <View style={styles.processActionButtons}>
                    <TouchableOpacity
                      style={styles.actionBtnSmall}
                      onPress={handleCopyProcess}
                    >
                      <Copy size={13} color={THEME.colors.accent} strokeWidth={2} />
                      <Text style={styles.actionBtnSmallText}>
                        {copyFeedback ? 'Copiado' : 'Copiar'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtnSmall, isEditingProcess && styles.actionBtnActive]}
                      onPress={() => setIsEditingProcess(!isEditingProcess)}
                    >
                      <Pencil size={13} color={THEME.colors.accent} strokeWidth={2} />
                      <Text style={styles.actionBtnSmallText}>
                        {isEditingProcess ? 'Viendo' : 'Editar'}
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
                      placeholder="Escribe o pega aqui los pasos de preparacion..."
                      placeholderTextColor={THEME.colors.textMuted}
                    />
                    <View style={styles.processEditActions}>
                      <TouchableOpacity
                        style={styles.btnCancelEdit}
                        onPress={() => {
                          setProcessEditText(selectedRecipe.process);
                          setIsEditingProcess(false);
                        }}
                      >
                        <Text style={styles.btnCancelEditText}>Cancelar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnSaveEdit}
                        onPress={handleSaveProcess}
                      >
                        <Text style={styles.btnSaveEditText}>Guardar Pasos</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* Back to list button */}
              <TouchableOpacity style={styles.bottomCloseBtn} onPress={closeRecipeModal}>
                <Text style={styles.bottomCloseBtnText}>Volver a la Lista</Text>
              </TouchableOpacity>
            </ScrollView>
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
  headerInfo: {
    paddingHorizontal: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  headerDesc: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  recipesList: {
    gap: 12,
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
    marginBottom: 14,
  },
  recipeCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  recipeCardSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  chevronBox: {
    width: 28,
    height: 28,
    borderRadius: THEME.radius.sm,
    backgroundColor: '#0c0a09',
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
    fontSize: 15,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  costSubUsd: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: THEME.colors.bg,
  },
  modalNavHeader: {
    backgroundColor: THEME.colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: 16,
    gap: 14,
  },
  recipeTitleSection: {},
  modalRecipeTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  modalRecipeSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
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
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  metricValueUsd: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  badgeWrapper: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.cardBorder,
  },
  yieldBadge: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.accentDark,
    borderWidth: 1,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  yieldBadgeText: {
    fontSize: 10,
    fontWeight: '800',
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
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.cardBorder,
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  ingredientAmount: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  ingredientPrices: {
    alignItems: 'flex-end',
  },
  ingPriceVes: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  ingPriceUsd: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
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
    backgroundColor: '#0c0a09',
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
    backgroundColor: '#0c0a09',
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
    backgroundColor: '#0c0a09',
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
    backgroundColor: '#0c0a09',
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
    color: '#0c0a09',
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
});
