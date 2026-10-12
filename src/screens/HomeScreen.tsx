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
import {
  checkForAppUpdate,
  openAppUpdateDownload,
  downloadAndInstallApk,
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
  const [isSyncingRates, setIsSyncingRates] = useState(false);

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
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState('');

  const handleStartHomeScreenUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;
    setIsDownloadingApk(true);
    setDownloadProgress(0);
    setDownloadStatusText('Conectando...');

    const result = await downloadAndInstallApk(updateInfo.downloadUrl, (ratio) => {
      setDownloadProgress(ratio);
      if (ratio >= 1) {
        setDownloadStatusText('Iniciando instalador nativo...');
      } else {
        setDownloadStatusText(`Descargando: ${Math.round(ratio * 100)}%`);
      }
    });

    if (!result.success) {
      setIsDownloadingApk(false);
      Alert.alert(
        'Aviso de Descarga',
        'No fue posible iniciar la instalacion nativa. ¿Deseas descargar desde el navegador?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Abrir Navegador',
            onPress: () => updateInfo.downloadUrl && openAppUpdateDownload(updateInfo.downloadUrl),
          },
        ]
      );
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      const info = await checkForAppUpdate();
      if (info.hasUpdate) {
        setUpdateInfo(info);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

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

          {isDownloadingApk ? (
            <View style={styles.cardDownloadProgressSection}>
              <View style={styles.cardDownloadProgressBarTrack}>
                <View style={[styles.cardDownloadProgressBarFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <View style={styles.cardDownloadProgressRow}>
                <Text style={styles.cardDownloadStatusText}>{downloadStatusText}</Text>
                <Text style={styles.cardDownloadPercentText}>{Math.round(downloadProgress * 100)}%</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.updateActionBtn}
              onPress={handleStartHomeScreenUpdate}
            >
              <Text style={styles.updateActionBtnText}>Actualizar Directamente</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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
  cardDownloadProgressSection: {
    marginTop: 6,
    gap: 8,
  },
  cardDownloadProgressBarTrack: {
    height: 8,
    backgroundColor: '#0c0a09',
    borderRadius: THEME.radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
  },
  cardDownloadProgressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.full,
  },
  cardDownloadProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDownloadStatusText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  cardDownloadPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.accent,
  },
});
