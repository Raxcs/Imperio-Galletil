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
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  rates,
  onRatesUpdated,
  onNavigateToProduction,
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
    const result = await syncBcvRates();
    setIsSyncingRates(false);
    if (result.updated) {
      onRatesUpdated(result.rates);
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


      {/* Official BCV Rates Card - Tap to Sync */}
      <TouchableOpacity
        style={[styles.card, styles.ratesCardTouchable]}
        onPress={handleSyncBcv}
        disabled={isSyncingRates}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardSubtitle}>TASAS OFICIALES BCV</Text>
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
          <View style={styles.rateSubCard}>
            <Text style={styles.rateLabel}>Dolar Oficial</Text>
            <Text style={styles.rateValue}>
              Bs. {rates.usd_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.rateCurrency}>1 USD</Text>
          </View>

          <View style={styles.rateSubCard}>
            <Text style={styles.rateLabel}>Euro Oficial</Text>
            <Text style={styles.rateValue}>
              Bs. {rates.eur_ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.rateCurrency}>1 EUR</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Quick Calculator Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Conversor Rapido de Cobro</Text>
        </View>

        {/* Currency Switcher */}
        <View style={styles.currencyToggleContainer}>
          {(['USD', 'VES', 'EUR'] as const).map((curr) => {
            const isActive = baseCurrency === curr;
            return (
              <TouchableOpacity
                key={curr}
                style={[styles.currencyBtn, isActive && styles.currencyBtnActive]}
                onPress={() => handleCurrencyChange(curr)}
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
  ratesCardTouchable: {
    borderColor: THEME.colors.cardBorderHighlight,
  },
  cardTapHint: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.colors.textMuted,
    marginTop: 2,
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

});
