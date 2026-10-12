import {
  checkForAppUpdate,
  downloadAndInstallApk,
  isRemoteVersionNewer,
  CURRENT_APP_VERSION,
} from '../services/updateService';
import { Platform } from 'react-native';

describe('Update Service and In-App APK Downloader', () => {
  it('should compare semantic versions correctly', () => {
    expect(isRemoteVersionNewer('1.0.9', '1.0.8')).toBe(true);
    expect(isRemoteVersionNewer('v1.0.9', '1.0.8')).toBe(true);
    expect(isRemoteVersionNewer('Imperio Galletil Mobile v1.0.9', '1.0.8')).toBe(true);
    expect(isRemoteVersionNewer('1.0.8', '1.0.8')).toBe(false);
    expect(isRemoteVersionNewer('v1.0.7', '1.0.8')).toBe(false);
    expect(isRemoteVersionNewer('Imperio Galletil Mobile v1.0.7', '1.0.8')).toBe(false);
  });

  it('should return no update if release version is equal or older than current version', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Imperio Galletil Mobile v1.0.7',
            published_at: '2026-10-11T04:34:42Z',
            assets: [{ name: 'Imperio-Galletil.apk', browser_download_url: 'https://test.com/app.apk' }],
          }),
      }) as any;

      const result = await checkForAppUpdate();
      expect(result.hasUpdate).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should detect update if release version is newer than local version', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Imperio Galletil Mobile v1.0.9',
            published_at: '2026-10-12T20:00:00Z',
            body: 'Correccion de pruebas y mejoras de rendimiento',
            assets: [{ name: 'Imperio-Galletil.apk', browser_download_url: 'https://github.com/test/download/app.apk' }],
          }),
      }) as any;

      const result = await checkForAppUpdate();
      expect(result.hasUpdate).toBe(true);
      expect(result.version).toBe('Imperio Galletil Mobile v1.0.9');
      expect(result.downloadUrl).toBe('https://github.com/test/download/app.apk');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should fallback gracefully when network fails', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;
      const result = await checkForAppUpdate();
      expect(result.hasUpdate).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
