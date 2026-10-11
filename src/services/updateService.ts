import { Linking } from 'react-native';

// Build timestamp of the current compiled app
export const CURRENT_BUILD_TIMESTAMP = '2026-10-11T04:34:00Z';
export const CURRENT_APP_VERSION = '1.0.0';

export interface AppUpdateInfo {
  hasUpdate: boolean;
  version?: string;
  releaseDate?: string;
  downloadUrl?: string;
  changelog?: string;
}

const GITHUB_RELEASE_API = 'https://api.github.com/repos/Raxcs/Imperio-Galletil/releases/latest';
const FALLBACK_VERSION_URL = 'https://raw.githubusercontent.com/Raxcs/Imperio-Galletil/main/version.json';

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  try {
    // 1. Query GitHub Releases API for the latest published release
    const res = await fetch(`${GITHUB_RELEASE_API}?t=${Date.now()}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ImperioGalletilApp',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.published_at && Array.isArray(data.assets)) {
        const publishedDate = new Date(data.published_at).getTime();
        const localDate = new Date(CURRENT_BUILD_TIMESTAMP).getTime();

        // If the GitHub release was published after this app build was compiled
        if (publishedDate > localDate) {
          const apkAsset = data.assets.find((a: any) =>
            typeof a.name === 'string' && a.name.endsWith('.apk')
          );

          const downloadUrl = apkAsset
            ? apkAsset.browser_download_url
            : 'https://github.com/Raxcs/Imperio-Galletil/releases/latest/download/Imperio-Galletil.apk';

          return {
            hasUpdate: true,
            version: data.name || data.tag_name || 'Nueva version',
            releaseDate: data.published_at ? data.published_at.split('T')[0] : '',
            downloadUrl,
            changelog: data.body || 'Mejoras y correcciones en la produccion y ventas.',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Error querying GitHub Releases API', err);
  }

  // 2. Fallback check with version.json
  try {
    const fbRes = await fetch(`${FALLBACK_VERSION_URL}?t=${Date.now()}`);
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      if (fbData && fbData.buildNumber && fbData.buildNumber > 1) {
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
