/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
    '^../lib/supabase$': '<rootDir>/__mocks__/supabase.js',
    '^./lib/supabase$': '<rootDir>/__mocks__/supabase.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system.js',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.js',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
    '^expo-intent-launcher$': '<rootDir>/__mocks__/expo-intent-launcher.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true } }],
  },
};
