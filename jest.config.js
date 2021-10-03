module.exports = {
  "roots": [
    "<rootDir>/test",
    "<rootDir>/src"
  ],
  "extensionsToTreatAsEsm": ['.ts', '.tsx'],
  "globals": {
    "ts-jest": {
      "tsConfigFile": "tsconfig.json",
      "diagnostics": false,
      "useESM": true,
      // "autoMapModuleNames": true
    }
  },
  "transform": {
    "^.+\\.tsx?$": "ts-jest",
    "^.+\\.jsx?$": "ts-jest"
  },
  "transformIgnorePatterns": [],
  "testRegex": "(/__tests__/.*|(\\.|/)test)\\.ts$",
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "json",
    "node"
  ],
  "moduleNameMapper": {
    '^(.*)\\.js$': ['$1', '$1.ts', '$1.js'],
  },
}
