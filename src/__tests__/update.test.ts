import { checkForAppUpdate, downloadAndInstallApk, CURRENT_BUILD_TIMESTAMP } from '../services/updateService';
import { Platform } from 'react-native';

describe('Update Service and In-App APK Downloader', () => {
  it('should return no update if release is older than current build timestamp', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            published_at: '2026-01-01T00:00:00Z',
            assets: [{ name: 'Imperio-Galletil.apk', browser_download_url: 'https://test.com/app.apk' }],
          }),
      }) as any;

      const result = await checkForAppUpdate();
      expect(result.hasUpdate).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should detect update if release timestamp is newer than local build timestamp', async () => {
    const originalFetch = global.fetch;
    try {
      const futureDate = new Date(new Date(CURRENT_BUILD_TIMESTAMP).getTime() + 10000000).toISOString();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'v1.0.9',
            published_at: futureDate,
            body: 'Correccion de pruebas y mejoras de rendimiento',
            assets: [{ name: 'Imperio-Galletil.apk', browser_download_url: 'https://github.com/test/download/app.apk' }],
          }),
      }) as any;

      const result = await checkForAppUpdate();
      expect(result.hasUpdate).toBe(true);
      expect(result.version).toBe('v1.0.9');
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
