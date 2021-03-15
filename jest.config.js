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
    "^.+\\.tsx?$": "ts-jest"
  },
  "testRegex": "(/__tests__/.*|(\\.|/)test)\\.ts$",
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "json",
    "node"
  ],
}
