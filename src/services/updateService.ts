import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

// Build timestamp of the current compiled app
export const CURRENT_BUILD_TIMESTAMP = '2026-10-12T19:40:00Z';
export const CURRENT_APP_VERSION = '1.0.8';

export interface AppUpdateInfo {
  hasUpdate: boolean;
  version?: string;
  releaseDate?: string;
  downloadUrl?: string;
  changelog?: string;
}

const GITHUB_RELEASE_API = 'https://api.github.com/repos/Raxcs/Imperio-Galletil/releases/latest';
const RELEASE_VERSION_URL = 'https://github.com/Raxcs/Imperio-Galletil/releases/latest/download/version.json';
const FALLBACK_VERSION_URL = 'https://raw.githubusercontent.com/Raxcs/Imperio-Galletil/main/version.json';

/**
 * Compara dos versiones semanticas y devuelve true si la version remota es estrictamente mayor.
 */
export function isRemoteVersionNewer(
  remoteVersionString: string,
  currentVersionString: string = CURRENT_APP_VERSION
): boolean {
  const parseNumbers = (str: string): number[] => {
    if (!str) return [0, 0, 0];
    const match = str.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return [0, 0, 0];
    return [
      parseInt(match[1], 10) || 0,
      parseInt(match[2], 10) || 0,
      parseInt(match[3], 10) || 0,
    ];
  };

  const remote = parseNumbers(remoteVersionString);
  const current = parseNumbers(currentVersionString);

  for (let i = 0; i < 3; i++) {
    if (remote[i] > current[i]) return true;
    if (remote[i] < current[i]) return false;
  }
  return false;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    // 1. Query GitHub Releases API for the latest published release with timeout
    const res = await fetch(`${GITHUB_RELEASE_API}?t=${Date.now()}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ImperioGalletilApp',
      },
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.assets)) {
        const remoteVersionName = data.name || data.tag_name || '';
        const isNewer = isRemoteVersionNewer(remoteVersionName, CURRENT_APP_VERSION);

        if (isNewer) {
          const apkAsset = data.assets.find((a: any) =>
            typeof a.name === 'string' && a.name.endsWith('.apk')
          );

          const downloadUrl = apkAsset
            ? apkAsset.browser_download_url
            : 'https://github.com/Raxcs/Imperio-Galletil/releases/latest/download/Imperio-Galletil.apk';

          return {
            hasUpdate: true,
            version: remoteVersionName,
            releaseDate: data.published_at ? data.published_at.split('T')[0] : '',
            downloadUrl,
            changelog: data.body || 'Mejoras y correcciones en la produccion y ventas.',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Error querying GitHub Releases API', err);
  } finally {
    clearTimeout(timeoutId);
  }

  // 2. Direct Release version.json check (Bypasses GitHub API rate limits)
  const relController = new AbortController();
  const relTimeoutId = setTimeout(() => relController.abort(), 3500);

  try {
    const relRes = await fetch(`${RELEASE_VERSION_URL}?t=${Date.now()}`, {
      signal: relController.signal,
    });

    if (relRes.ok) {
      const relData = await relRes.json();
      const relVersion = relData?.version || '';
      if (relData && isRemoteVersionNewer(relVersion, CURRENT_APP_VERSION)) {
        return {
          hasUpdate: true,
          version: relData.version,
          releaseDate: relData.releaseDate,
          downloadUrl: relData.downloadUrl || 'https://github.com/Raxcs/Imperio-Galletil/releases/latest/download/Imperio-Galletil.apk',
          changelog: relData.changelog || 'Mejoras y correcciones en la produccion y ventas.',
        };
      }
    }
  } catch (err) {
    console.warn('Error querying release version.json', err);
  } finally {
    clearTimeout(relTimeoutId);
  }

  // 3. Fallback check with raw repository version.json
  const fbController = new AbortController();
  const fbTimeoutId = setTimeout(() => fbController.abort(), 3500);

  try {
    const fbRes = await fetch(`${FALLBACK_VERSION_URL}?t=${Date.now()}`, {
      signal: fbController.signal,
    });

    if (fbRes.ok) {
      const fbData = await fbRes.json();
      const fbVersion = fbData?.version || '';
      if (fbData && isRemoteVersionNewer(fbVersion, CURRENT_APP_VERSION)) {
        return {
          hasUpdate: true,
          version: fbData.version,
          releaseDate: fbData.releaseDate,
          downloadUrl: fbData.downloadUrl,
          changelog: fbData.changelog,
        };
      }
    }
  } catch (err) {
    console.warn('Error querying fallback version.json', err);
  } finally {
    clearTimeout(fbTimeoutId);
  }

  return { hasUpdate: false };
}

export async function openAppUpdateDownload(downloadUrl: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(downloadUrl);
    if (supported) {
      await Linking.openURL(downloadUrl);
    }
  } catch (err) {
    console.warn('Error opening update download URL', err);
  }
}

export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress?: (ratio: number) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    if (Platform.OS !== 'android') {
      await openAppUpdateDownload(downloadUrl);
      return { success: true };
    }

    const localApkPath = `${FileSystem.cacheDirectory}Imperio-Galletil-update.apk`;

    // Ensure any previously cached update file is removed
    const info = await FileSystem.getInfoAsync(localApkPath);
    if (info.exists) {
      await FileSystem.deleteAsync(localApkPath, { idempotent: true });
    }

    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      localApkPath,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0 && onProgress) {
          const ratio = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress(Math.min(1, Math.max(0, ratio)));
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error('Descarga del paquete incompleta');
    }

    // Get Android content URI using Expo FileProvider
    const contentUri = await FileSystem.getContentUriAsync(result.uri);

    // Launch Android Package Installer directly
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });

    return { success: true };
  } catch (err: any) {
    console.warn('Error in downloadAndInstallApk', err);
    try {
      await openAppUpdateDownload(downloadUrl);
    } catch (_) {}
    return { success: false, error: err?.message || 'Error en instalacion nativa' };
  }
}
