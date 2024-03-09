import type { JestConfigWithTsJest } from 'ts-jest';
// ts-jest/presets/js-with-ts-esm
import { jsWithTsESM } from 'ts-jest/presets/index.js';

const jestConfig: JestConfigWithTsJest = {
  testEnvironment: 'node',
  testRegex: '/tests/.*\\.test\\.ts$', // test files are in a `tests` directory
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  transform: {
    ...jsWithTsESM.transform,
  },
  //detectOpenHandles: true,
}

export default jestConfig
