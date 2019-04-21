module.exports = {
  "roots": [
    "<rootDir>/test",
    "<rootDir>/src"
  ],
  "globals": {
    "ts-jest": {
      "tsConfigFile": "tsconfig.json",
      "diagnostics": false,
    }
  },
  "transform": {
    "^.+\\.ts$": "ts-jest"
  },
  "testRegex": "(/__tests__/.*|(\\.|/)test)\\.ts$",
  "moduleFileExtensions": [
    "ts",
    "js",
    "json",
    "node"
  ],
}
