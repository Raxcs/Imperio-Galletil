import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { THEME } from '../theme';
import { ExchangeRates } from '../types';
import { saveExchangeRates, syncBcvRates } from '../services/exchangeRatesService';
import {
  checkForAppUpdate,
  openAppUpdateDownload,
  AppUpdateInfo,
  CURRENT_APP_VERSION,
} from '../services/updateService';

interface HomeScreenProps {
  rates: ExchangeRates;
  onRatesUpdated: (newRates: ExchangeRates) => void;
  onNavigateToProduction: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  rates,
  onRatesUpdated,
  onNavigateToProduction,
}) => {
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
  const [amountStr, setAmountStr] = useState<string>('2');
  
  // Rate edit modal state
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [tempUsdRate, setTempUsdRate] = useState(rates.usd_ves.toString());
  const [tempEurRate, setTempEurRate] = useState(rates.eur_ves.toString());

  const numAmount = parseFloat(amountStr) || 0;

  // Conversions
  let displayVes = 0;
  let displayUsd = 0;
  let displayEur = 0;

  if (baseCurrency === 'USD') {
    displayUsd = numAmount;
    displayVes = numAmount * rates.usd_ves;
    displayEur = displayVes / rates.eur_ves;
  } else if (baseCurrency === 'VES') {
    displayVes = numAmount;
    displayUsd = numAmount / rates.usd_ves;
    displayEur = numAmount / rates.eur_ves;
  } else if (baseCurrency === 'EUR') {
    displayEur = numAmount;
    displayVes = numAmount * rates.eur_ves;
    displayUsd = displayVes / rates.usd_ves;
  }

  const handleSaveRates = async () => {
    const newUsd = parseFloat(tempUsdRate) || rates.usd_ves;
    const newEur = parseFloat(tempEurRate) || rates.eur_ves;
    const updated: ExchangeRates = { usd_ves: newUsd, eur_ves: newEur };
    await saveExchangeRates(updated);
    onRatesUpdated(updated);
    setIsRateModalOpen(false);
  };

  const [isSyncingRates, setIsSyncingRates] = useState(false);

  const handleSyncBcv = async () => {
    setIsSyncingRates(true);
    const result = await syncBcvRates();
    setIsSyncingRates(false);
    if (result.updated) {
      onRatesUpdated(result.rates);
      Alert.alert(
        'Tasas Oficiales Actualizadas',
        `Tasa oficial del BCV sincronizada:\nUSD: Bs. ${result.rates.usd_ves.toFixed(2)}\nEUR: Bs. ${result.rates.eur_ves.toFixed(2)}`
      );
    } else {
      Alert.alert(
        'Aviso de Conexion',
        'No fue posible consultar la tasa del BCV en linea en este instante. Se mantienen las tasas actuales.'
      );
    }
  };

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);

  React.useEffect(() => {
    (async () => {
      const info = await checkForAppUpdate();
      if (info.hasUpdate) {
        setUpdateInfo(info);
      }
    })();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      {/* App Update Notification Card */}
      {updateInfo && updateInfo.hasUpdate && (
        <View style={styles.updateCard}>
          <View style={styles.updateCardHeader}>
            <View>
              <Text style={styles.updateBadge}>ACTUALIZACION DISPONIBLE</Text>
              <Text style={styles.updateTitle}>Version {updateInfo.version}</Text>
            </View>
            <TouchableOpacity onPress={() => setUpdateInfo(null)}>
              <Text style={styles.updateDismissText}>Omitir</Text>
            </TouchableOpacity>
          </View>
          {!!updateInfo.changelog && (
            <Text style={styles.updateChangelog}>{updateInfo.changelog}</Text>
          )}
          <TouchableOpacity
            style={styles.updateActionBtn}
            onPress={() => updateInfo.downloadUrl && openAppUpdateDownload(updateInfo.downloadUrl)}
          >
            <Text style={styles.updateActionBtnText}>Actualizar Directamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Official BCV Rates Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardSubtitle}>TASAS OFICIALES BCV</Text>
          <View style={styles.cardHeaderActions}>
            <TouchableOpacity
              style={[styles.syncRateBtn, isSyncingRates && styles.syncRateBtnDisabled]}
              onPress={handleSyncBcv}
              disabled={isSyncingRates}
              activeOpacity={0.7}
            >
              <RefreshCw size={11} color={THEME.colors.accent} strokeWidth={2.5} />
              <Text style={styles.syncRateBtnText}>
                {isSyncingRates ? 'Sincronizando' : 'Sincronizar BCV'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.rateStatusPill}
              onPress={() => {
                setTempUsdRate(rates.usd_ves.toString());
                setTempEurRate(rates.eur_ves.toString());
                setIsRateModalOpen(true);
              }}
            >
              <View style={styles.statusDot} />
              <Text style={styles.rateStatusText}>Editar</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.ratesGrid}>
          <TouchableOpacity
            style={styles.rateSubCard}
            onPress={() => {
              setTempUsdRate(rates.usd_ves.toString());
              setTempEurRate(rates.eur_ves.toString());
              setIsRateModalOpen(true);
            }}
          >
            <Text style={styles.rateLabel}>Dolar Oficial</Text>
            <Text style={styles.rateValue}>
              Bs. {rates.usd_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.rateCurrency}>1 USD</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.rateSubCard}
            onPress={() => {
              setTempUsdRate(rates.usd_ves.toString());
              setTempEurRate(rates.eur_ves.toString());
              setIsRateModalOpen(true);
            }}
          >
            <Text style={styles.rateLabel}>Euro Oficial</Text>
            <Text style={styles.rateValue}>
              Bs. {rates.eur_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.rateCurrency}>1 EUR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Calculator Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Conversor Rapido de Cobro</Text>
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>Calculo en vivo</Text>
          </View>
        </View>

        {/* Currency Switcher */}
        <View style={styles.currencyToggleContainer}>
          {(['USD', 'VES', 'EUR'] as const).map((curr) => {
            const isActive = baseCurrency === curr;
            return (
              <TouchableOpacity
                key={curr}
                style={[styles.currencyBtn, isActive && styles.currencyBtnActive]}
                onPress={() => setBaseCurrency(curr)}
              >
                <Text style={[styles.currencyBtnText, isActive && styles.currencyBtnTextActive]}>
                  {curr}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Input Field */}
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.amountInput}
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="numeric"
            placeholder="0.00"
            placeholderTextColor={THEME.colors.textMuted}
          />
          <Text style={styles.inputCurrencySuffix}>{baseCurrency}</Text>
        </View>

        {/* Conversion Results */}
        <View style={styles.resultsGrid}>
          {baseCurrency === 'USD' && (
            <>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Bolivares (VES)</Text>
                <Text style={styles.resultValue}>
                  Bs. {displayVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Euros (EUR)</Text>
                <Text style={styles.resultValue}>
                  {displayEur.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                </Text>
              </View>
            </>
          )}

          {baseCurrency === 'VES' && (
            <>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Dolares (USD)</Text>
                <Text style={styles.resultValue}>
                  ${displayUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Euros (EUR)</Text>
                <Text style={styles.resultValue}>
                  {displayEur.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                </Text>
              </View>
            </>
          )}

          {baseCurrency === 'EUR' && (
            <>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Bolivares (VES)</Text>
                <Text style={styles.resultValue}>
                  Bs. {displayVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Dolares (USD)</Text>
                <Text style={styles.resultValue}>
                  ${displayUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Quick Action Banner */}
      <TouchableOpacity
        style={styles.bannerAction}
        onPress={onNavigateToProduction}
        activeOpacity={0.8}
      >
        <View>
          <Text style={styles.bannerTitle}>Produccion del Dia</Text>
          <Text style={styles.bannerSubtitle}>Calcula rentabilidad y registra packs de galletas</Text>
        </View>
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>Ver Reporte</Text>
        </View>
      </TouchableOpacity>

      {/* Rate Edit Modal */}
      <Modal
        visible={isRateModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRateModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Actualizar Tasa BCV</Text>
            <Text style={styles.modalSubtitle}>Ingresa la cotizacion oficial del dia</Text>

            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Tasa USD (Bolivares)</Text>
              <TextInput
                style={styles.modalInput}
                value={tempUsdRate}
                onChangeText={setTempUsdRate}
                keyboardType="numeric"
                placeholder="875.70"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Tasa EUR (Bolivares)</Text>
              <TextInput
                style={styles.modalInput}
                value={tempEurRate}
                onChangeText={setTempEurRate}
                keyboardType="numeric"
                placeholder="976.62"
                placeholderTextColor={THEME.colors.textMuted}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setIsRateModalOpen(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnSave}
                onPress={handleSaveRates}
              >
                <Text style={styles.modalBtnSaveText}>Guardar Tasas</Text>
              </TouchableOpacity>
            </View>
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
    gap: 16,
  },
  card: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncRateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.full,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  syncRateBtnDisabled: {
    opacity: 0.6,
  },
  syncRateBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  rateStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.full,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: THEME.colors.success,
  },
  rateStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accentLight,
  },
  ratesGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  rateSubCard: {
    flex: 1,
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  rateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  rateValue: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  rateCurrency: {
    fontSize: 10,
    fontWeight: '500',
    color: THEME.colors.textMuted,
  },
  badgePill: {
    backgroundColor: THEME.colors.accentBg,
    borderColor: THEME.colors.accentDark,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.radius.full,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accentLight,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#0c0a09',
    padding: 3,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    marginBottom: 12,
  },
  currencyBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: THEME.radius.sm,
  },
  currencyBtnActive: {
    backgroundColor: THEME.colors.accent,
  },
  currencyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  currencyBtnTextActive: {
    color: '#0c0a09',
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  amountInput: {
    backgroundColor: '#0c0a09',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  inputCurrencySuffix: {
    position: 'absolute',
    right: 16,
    top: 15,
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  resultsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0c0a09',
    padding: 12,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    gap: 12,
  },
  resultItem: {
    flex: 1,
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.accent,
    marginBottom: 2,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  bannerAction: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  bannerSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  bannerBadge: {
    backgroundColor: THEME.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.md,
  },
  bannerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0c0a09',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginBottom: 16,
  },
  modalField: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
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
  updateCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.accent,
    padding: 16,
    gap: 8,
  },
  updateCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  updateBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.5,
  },
  updateTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  updateDismissText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  updateChangelog: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  updateActionBtn: {
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  updateActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0c0a09',
  },
});
