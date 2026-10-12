module.exports = {
  Platform: { OS: 'android' },
  Linking: {
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  },
  Alert: {
    alert: jest.fn(),
  },
};
