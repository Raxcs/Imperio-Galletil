module.exports = {
  Platform: { OS: 'android' },
  Linking: {
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  },
  Alert: {
    alert: jest.fn(),
  },
  AppState: (() => {
    const listeners = new Set();
    return {
      currentState: 'active',
      addEventListener: jest.fn((_type, listener) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      }),
      /** Test helper: simulates the app changing state (e.g. coming back to foreground). */
      __emit: (state) => listeners.forEach((l) => l(state)),
    };
  })(),
};
