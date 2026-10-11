import { Linking } from 'react-native';

export const CURRENT_APP_VERSION = '1.0.0';
export const CURRENT_BUILD_NUMBER = 1;

export interface AppUpdateInfo {
  hasUpdate: boolean;
  version?: string;
  buildNumber?: number;
  releaseDate?: string;
  downloadUrl?: string;
  changelog?: string;
}

const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Raxcs/Imperio-Galletil/main/version.json';

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      return { hasUpdate: false };
    }

    const data = await response.json();
    if (data && typeof data.buildNumber === 'number') {
      if (data.buildNumber > CURRENT_BUILD_NUMBER) {
        return {
          hasUpdate: true,
          version: data.version,
          buildNumber: data.buildNumber,
          releaseDate: data.releaseDate,
          downloadUrl: data.downloadUrl,
          changelog: data.changelog,
        };
      }
    }
  } catch (err) {
    console.warn('Error checking for app updates', err);
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
