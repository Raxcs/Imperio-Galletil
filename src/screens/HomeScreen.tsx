import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { THEME } from '../theme';
import { ExchangeRates } from '../types';
import { syncBcvRates } from '../services/exchangeRatesService';

interface HomeScreenProps {
  rates: ExchangeRates;
  onRatesUpdated: (newRates: ExchangeRates) => void;
  onNavigateToProduction: () => void;
  onSyncAll?: () => Promise<void>;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  rates,
  onRatesUpdated,
  onNavigateToProduction,
  onSyncAll,
}) => {
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
  const [amountStr, setAmountStr] = useState<string>('1');
  const [isSyncingRates, setIsSyncingRates] = useState(false);

  const numAmount = parseFloat(amountStr) || 0;

  const handleCurrencyChange = (newCurrency: 'USD' | 'VES' | 'EUR') => {
    if (newCurrency === baseCurrency) return;

    const currentVal = parseFloat(amountStr) || 0;
    if (currentVal === 0) {
      setBaseCurrency(newCurrency);
      setAmountStr('0');
      return;
    }

    let converted = 0;
    if (baseCurrency === 'USD') {
      if (newCurrency === 'VES') {
        converted = currentVal * rates.usd_ves;
      } else if (newCurrency === 'EUR') {
        const inVes = currentVal * rates.usd_ves;
        converted = inVes / rates.eur_ves;
      }
    } else if (baseCurrency === 'VES') {
      if (newCurrency === 'USD') {
        converted = currentVal / rates.usd_ves;
      } else if (newCurrency === 'EUR') {
        converted = currentVal / rates.eur_ves;
      }
    } else if (baseCurrency === 'EUR') {
      if (newCurrency === 'USD') {
        const inVes = currentVal * rates.eur_ves;
        converted = inVes / rates.usd_ves;
      } else if (newCurrency === 'VES') {
        converted = currentVal * rates.eur_ves;
      }
    }

    const formatted = converted % 1 === 0 ? converted.toFixed(0) : converted.toFixed(2);
    setBaseCurrency(newCurrency);
    setAmountStr(formatted);
  };

  // Conversions
  let displayVes = 0;
  let displayUsd = 0;
  let displayEur = 0;

  if (baseCurrency === 'USD') {
    displayUsd = numAmount;
    displayVes = numAmount * rates.usd_ves;
    displayEur = rates.eur_ves > 0 ? displayVes / rates.eur_ves : 0;
  } else if (baseCurrency === 'VES') {
    displayVes = numAmount;
    displayUsd = rates.usd_ves > 0 ? numAmount / rates.usd_ves : 0;
    displayEur = rates.eur_ves > 0 ? numAmount / rates.eur_ves : 0;
  } else if (baseCurrency === 'EUR') {
    displayEur = numAmount;
    displayVes = numAmount * rates.eur_ves;
    displayUsd = rates.usd_ves > 0 ? displayVes / rates.usd_ves : 0;
  }

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

  const handlePullRefresh = async () => {
    setIsSyncingRates(true);
    try {
      const result = await syncBcvRates();
      if (result.updated) {
        onRatesUpdated(result.rates);
      }
      if (onSyncAll) {
        await onSyncAll();
      }
    } catch (err) {
      console.warn('Error on pull refresh', err);
    } finally {
      setIsSyncingRates(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isSyncingRates}
          onRefresh={handlePullRefresh}
          tintColor={THEME.colors.accent}
          colors={[THEME.colors.accent]}
        />
      }
    >
      {/* Official BCV Rates Card */}
      <TouchableOpacity
        style={styles.ratesCard}
        onPress={handleSyncBcv}
        disabled={isSyncingRates}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardEyebrow}>TASAS OFICIALES BCV</Text>
            <Text style={styles.cardTapHint}>
              {isSyncingRates ? 'Consultando cotizacion oficial...' : 'Toca para actualizar en vivo'}
            </Text>
          </View>
          <View style={styles.rateStatusPill}>
            {isSyncingRates ? (
              <ActivityIndicator size="small" color={THEME.colors.accent} />
            ) : (
              <>
                <View style={styles.statusDot} />
                <Text style={styles.rateStatusText}>En vivo</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.ratesGrid}>
          {/* USD Card */}
          <View style={styles.rateSubCard}>
            <Text style={styles.rateLabel}>Dolar Oficial</Text>
            <Text style={styles.rateValue}>
              Bs. {rates.usd_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.rateEquiv}>1 USD = Bs. {rates.usd_ves.toFixed(2)}</Text>
          </View>

          {/* EUR Card */}
          <View style={styles.rateSubCard}>
            <Text style={styles.rateLabel}>Euro Oficial</Text>
            <Text style={styles.rateValue}>
              Bs. {rates.eur_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.rateEquiv}>1 EUR = Bs. {rates.eur_ves.toFixed(2)}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Quick Calculator Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Conversor Rapido de Cobro</Text>
        </View>

        {/* Currency Switcher Segmented Control */}
        <View style={styles.currencyToggleContainer}>
          {(['USD', 'VES', 'EUR'] as const).map((curr) => {
            const isActive = baseCurrency === curr;
            return (
              <TouchableOpacity
                key={curr}
                style={[styles.currencyBtn, isActive && styles.currencyBtnActive]}
                onPress={() => handleCurrencyChange(curr)}
                activeOpacity={0.7}
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
            placeholder="1.00"
            placeholderTextColor={THEME.colors.textMuted}
          />
          <View style={styles.inputCurrencyBadge}>
            <Text style={styles.inputCurrencySuffix}>{baseCurrency}</Text>
          </View>
        </View>

        {/* Conversion Results Grid */}
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
                  € {displayEur.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </>
          )}

          {baseCurrency === 'VES' && (
            <>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Dolares (USD)</Text>
                <Text style={styles.resultValue}>
                  $ {displayUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Euros (EUR)</Text>
                <Text style={styles.resultValue}>
                  € {displayEur.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  $ {displayUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
  },
  ratesCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorderHighlight,
    padding: 16,
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
  cardEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.accent,
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  cardTapHint: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  rateStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: THEME.radius.full,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.success,
  },
  rateStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.success,
  },
  ratesGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  rateSubCard: {
    flex: 1,
    backgroundColor: '#09090b',
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
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: 3,
  },
  rateEquiv: {
    fontSize: 10,
    fontWeight: '500',
    color: THEME.colors.textMuted,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#09090b',
    padding: 3,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    marginBottom: 12,
  },
  currencyBtn: {
    flex: 1,
    paddingVertical: 7,
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
    color: '#09090b',
    fontWeight: '800',
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  amountInput: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    borderRadius: THEME.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  inputCurrencyBadge: {
    position: 'absolute',
    right: 14,
    top: 13,
    backgroundColor: '#18181b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  inputCurrencySuffix: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.accentLight,
  },
  resultsGrid: {
    flexDirection: 'row',
    backgroundColor: '#09090b',
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
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});
