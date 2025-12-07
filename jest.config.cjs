module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.ts',
    '**/src/**/__tests__/**/*.test.ts'
  ],
  // Display full paths in test output
  displayName: {
    name: 'AGI-CORE',
    color: 'blue',
  },
  verbose: true,
  // Exclude tests that use Node's native test runner (node:test) - these need to run with `node --test`
  testPathIgnorePatterns: [
    '/node_modules/',
    // Tests using node:test that are incompatible with Jest
    'test/customCommands.test.ts',
    'test/health-check.test.ts',
    'test/mcpConfig.test.ts',
    'test/providerFactory.test.ts',
    'test/safetyValidator.test.ts',
    'test/skillRepository.test.ts',
    'test/taskCompletionDetector.test.ts',
    'test/toolSuites.test.ts',
    'test/webTools.test.ts',
    // Tests for unimplemented features
    'test/robustInputProcessor.test.ts',
    // Tests for modules that are scripts, not testable classes
    'test/isolated-verification.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coveragePathIgnorePatterns: [
    'src/core/agentOrchestrator.ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src', '<rootDir>/test'],
  transform: {
    '^.+\\.(ts|tsx)$': 'babel-jest',
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.cjs'],
};
