/**
 * Jest runs the jest-style suite (describe/it/expect + @jest/globals).
 * node:test suites live alongside in __tests__ and run via `npm run test:unit`
 * (node --test). Keeping the runners separate avoids the classic
 * "Your test suite must contain at least one test" failure.
 */
export default {
  testEnvironment: 'node',
  // Pure ESM project: run tests as real ES modules (no transpile) with
  // `node --experimental-vm-modules` (wired into the npm scripts).
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
  passWithNoTests: true,
};
