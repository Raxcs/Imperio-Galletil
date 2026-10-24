// Shared across jest.resetModules() so a simulated app restart keeps its "disk", like a real device
const storage = (globalThis.__asyncStorageMock = globalThis.__asyncStorageMock || {});

module.exports = {
  getItem: jest.fn(async (key) => storage[key] || null),
  setItem: jest.fn(async (key, value) => {
    storage[key] = value;
  }),
  removeItem: jest.fn(async (key) => {
    delete storage[key];
  }),
  clear: jest.fn(async () => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
  }),
};
