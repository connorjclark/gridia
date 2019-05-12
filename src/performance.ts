// Because parcel does not support externals.
// https://github.com/parcel-bundler/parcel/issues/144

let performance: typeof window.performance;
if (typeof window !== 'undefined') {
  performance = window.performance;
} else {
  // Prevents parcel from erroring: 'Cannot resolve dependency'
  const moduleName = 'perf_hooks';
  performance = require(moduleName).performance;
}

export default performance;
