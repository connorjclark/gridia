// Because parcel does not support externals.
// https://github.com/parcel-bundler/parcel/issues/144

export let performance: typeof window.performance;

if (typeof process !== 'undefined' && typeof process.release !== 'undefined') {
  // Prevents parcel from erroring: 'Cannot resolve dependency'
  const moduleName = 'perf_hooks';
  performance = require(moduleName).performance;
} else {
  performance = self.performance;
}
