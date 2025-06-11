// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
const setupFile = path.resolve(__dirname, './jest-setup.js');
const cssMockFile = path.resolve(__dirname, './__mocks__/cssMock.js');
const esmFile = path.resolve(__dirname, './__mocks__/esm.js');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: [setupFile],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': esmFile,
    '^.+\\.css$': cssMockFile,
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  snapshotSerializers: ['jest-serializer-html'],
  testMatch: ['**/__test__/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
