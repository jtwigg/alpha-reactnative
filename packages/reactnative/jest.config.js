/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/crash-guard/**/*.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/crash-guard/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  clearMocks: true,
  testTimeout: 20000,
};
