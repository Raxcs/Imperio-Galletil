module.exports = {
  cacheDirectory: 'file:///data/user/0/com.imperio.galletil/cache/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn(() => ({
    downloadAsync: jest.fn().mockResolvedValue({
      uri: 'file:///data/user/0/com.imperio.galletil/cache/Imperio-Galletil-update.apk',
    }),
  })),
  getContentUriAsync: jest.fn().mockResolvedValue(
    'content://com.imperio.galletil.FileSystemFileProvider/cache/Imperio-Galletil-update.apk'
  ),
};
