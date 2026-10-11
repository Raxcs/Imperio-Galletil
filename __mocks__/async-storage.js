const storage = {};

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
