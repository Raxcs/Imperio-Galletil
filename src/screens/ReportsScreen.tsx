import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { Plus, Trash } from 'lucide-react-native';
import { THEME } from '../theme';
import { ProductionLog, ExchangeRates, Recipe } from '../types';
import {
  addProductionLogInBackend,
  deleteProductionLogInBackend,
  setCachedProductionLogs,
} from '../services/productionService';

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
  const [prodName, setProdName] = useState(initialRecipe?.title || 'Galletas Clasicas');
  const [prodQtyStr, setProdQtyStr] = useState(initialRecipe?.batch_yield ? initialRecipe.batch_yield.toString() : '23');
  const [prodPriceStr, setProdPriceStr] = useState('1000');
  const [prodCost, setProdCost] = useState(initialCost);

  // Totals
  let totalGrossVes = 0;
  let totalReinvestVes = 0;

  logs.forEach((item) => {
    const itemGross = item.qty * item.price_ves;
    const itemCost = item.qty * item.cost_ves;
    totalGrossVes += itemGross;
    totalReinvestVes += itemCost;
  });

  const netProfitVes = Math.max(0, totalGrossVes - totalReinvestVes);
  const netProfitUsd = netProfitVes / rates.usd_ves;
  const grossUsd = totalGrossVes / rates.usd_ves;
  const reinvestUsd = totalReinvestVes / rates.usd_ves;

  const margin = totalGrossVes > 0
    ? ((netProfitVes / totalGrossVes) * 100).toFixed(1)
    : '0';

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
    const trimmed = prodName.trim();
    const qty = parseInt(prodQtyStr, 10) || 0;
    const price = parseFloat(prodPriceStr) || 0;

    if (!trimmed || qty <= 0 || price <= 0) {
      Alert.alert('Datos requeridos', 'Por favor ingresa un nombre, cantidad y precio valido.');
      return;
    }

    const matchedRecipe = recipes.find(
      (r) => r.title.toLowerCase().trim() === trimmed.toLowerCase() ||
             trimmed.toLowerCase().includes(r.title.toLowerCase().trim())
    );

    const calculatedCost = matchedRecipe
      ? Number((matchedRecipe.pack_cost_usd * rates.usd_ves).toFixed(2))
      : prodCost;

    const newLogData: Omit<ProductionLog, 'id'> = {
      name: trimmed,
      qty,
      price_ves: price,
      cost_ves: calculatedCost,
    };

    const saved = await addProductionLogInBackend(newLogData);
    const updated = [saved, ...logs];
    onLogsUpdated(updated);
    await setCachedProductionLogs(updated);

    setIsAddFormVisible(false);
  };

  const handleDeleteLog = async (id: string) => {
    Alert.alert(
      'Eliminar Registro',
      'Deseas eliminar este registro de produccion?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const updated = logs.filter((l) => l.id !== id);
            onLogsUpdated(updated);
            await setCachedProductionLogs(updated);
            await deleteProductionLogInBackend(id);
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      {/* Top Banner: Ganancia Neta Libre */}
      <View style={styles.netProfitCard}>
        <View style={styles.netProfitHeader}>
          <Text style={styles.netProfitTitle}>GANANCIA NETA LIBRE</Text>
          <View style={styles.pocketBadge}>
            <Text style={styles.pocketBadgeText}>Tu Bolsillo</Text>
          </View>
        </View>

        <View style={styles.netProfitAmountRow}>
          <Text style={styles.netProfitVes}>
            Bs. {netProfitVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.netProfitUsd}>
            ${netProfitUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </Text>
        </View>

        <View style={styles.marginRow}>
          <Text style={styles.marginLabel}>Margen libre real</Text>
          <Text style={styles.marginValue}>{margin}% de rentabilidad</Text>
        </View>
      </View>

      {/* Two Secondary Metric Cards */}
      <View style={styles.secondaryCardsGrid}>
        {/* Total Cobrado */}
        <View style={styles.secCard}>
          <Text style={styles.secCardLabel}>TOTAL COBRADO</Text>
          <Text style={styles.secCardVes}>
            Bs. {totalGrossVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.secCardUsd}>
            ${grossUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </Text>
          <Text style={styles.secCardSub}>Ingreso bruto de venta</Text>
        </View>

        {/* Fondo a Reinvertir */}
        <View style={styles.secCard}>
          <Text style={styles.secCardLabel}>FONDO A REINVERTIR</Text>
          <Text style={styles.secCardVes}>
            Bs. {totalReinvestVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.secCardUsd}>
            ${reinvestUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </Text>
          <Text style={[styles.secCardSub, { color: THEME.colors.accent }]}>
            Fondo intocable insumos
          </Text>
        </View>
      </View>

      {/* Production Log Section */}
      <View style={styles.prodSectionCard}>
        <View style={styles.prodSectionHeader}>
          <View>
            <Text style={styles.prodSectionTitle}>REGISTRO DE PRODUCCION</Text>
            <Text style={styles.prodSectionSubtitle}>Productos elaborados en la jornada</Text>
          </View>
          <TouchableOpacity
            style={styles.addProdBtn}
            onPress={() => setIsAddFormVisible(!isAddFormVisible)}
          >
            <Plus size={14} color={THEME.colors.accent} strokeWidth={2.5} />
            <Text style={styles.addProdBtnText}>Añadir</Text>
          </TouchableOpacity>
        </View>

        {/* Expandable Form */}
        {isAddFormVisible && (
          <View style={styles.addProdFormBox}>
            <Text style={styles.formPromptTitle}>Nuevo Producto en Produccion</Text>

            {/* Presets based on actual recipes */}
            <View style={styles.presetButtonsRow}>
              {recipes.map((recipe) => {
                const isActive = prodName.toLowerCase().trim() === recipe.title.toLowerCase().trim();
                const unitCostVes = recipe.pack_cost_usd * rates.usd_ves;
                return (
                  <TouchableOpacity
                    key={recipe.id}
                    style={[styles.presetBtn, isActive && styles.presetBtnActive]}
                    onPress={() => handleSelectRecipePreset(recipe)}
                  >
                    <Text style={[styles.presetBtnText, isActive && styles.presetBtnTextActive]}>
                      {recipe.title} (Bs. {unitCostVes.toFixed(0)})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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

            <TouchableOpacity style={styles.submitProdBtn} onPress={handleAddProduction}>
              <Text style={styles.submitProdBtnText}>Aceptar y Recalcular</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* List of items */}
        <View style={styles.logsList}>
          {logs.map((item) => {
            const itemGross = item.qty * item.price_ves;
            const itemCost = item.qty * item.cost_ves;
            const itemProfit = itemGross - itemCost;
            const itemProfitUsd = itemProfit / rates.usd_ves;
            const itemGrossUsd = itemGross / rates.usd_ves;

            return (
              <View key={item.id} style={styles.logCard}>
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
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteLog(item.id)}
                  >
                    <Trash size={16} color={THEME.colors.danger} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </View>
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
  netProfitCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
  },
  netProfitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  netProfitTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.5,
  },
  pocketBadge: {
    backgroundColor: THEME.colors.accentDark,
    borderRadius: THEME.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pocketBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accentLight,
  },
  netProfitAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  netProfitVes: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  netProfitUsd: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.accent,
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
  marginValue: {
    fontSize: 11,
    fontWeight: '800',
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
  },
  secCardVes: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  secCardUsd: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginBottom: 4,
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
    letterSpacing: 0.5,
  },
  prodSectionSubtitle: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  addProdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0c0a09',
    borderWidth: 1,
    borderColor: THEME.colors.accentDark,
    borderRadius: THEME.radius.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addProdBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  addProdFormBox: {
    backgroundColor: '#0c0a09',
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
  },
  presetBtn: {
    flex: 1,
    backgroundColor: THEME.colors.card,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  presetBtnActive: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.accent,
  },
  presetBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  presetBtnTextActive: {
    color: THEME.colors.accentLight,
    fontWeight: '800',
  },
  fieldWrapper: {},
  rowFields: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 7,
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
    color: '#0c0a09',
  },
  logsList: {
    gap: 8,
  },
  logCard: {
    backgroundColor: '#0c0a09',
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
    fontWeight: '800',
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
  },
  logGrossUsd: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  deleteBtn: {
    padding: 4,
  },
});
