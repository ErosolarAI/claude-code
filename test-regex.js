const testPaths = [
  '/node_modules/chalk/source/index.js',
  '/node_modules/gradient-string/dist/index.js',
  '/node_modules/ora/index.js',
  '/node_modules/boxen/index.js',
  '/node_modules/other-package/index.js',
  '/node_modules/@types/node/index.d.ts'
];

const patterns = [
  '/node_modules/(?!chalk|gradient-string|ora|boxen)/',
  '/node_modules/(?!(chalk|gradient-string|ora|boxen))/',
  'node_modules/(?!(chalk|gradient-string|ora|boxen))/',
  '/node_modules/(?!chalk|gradient-string|ora|boxen)',
  '/node_modules/(?!(chalk|gradient-string|ora|boxen))'
];

console.log('Testing patterns:');
for (const pattern of patterns) {
  console.log(`\nPattern: ${pattern}`);
  try {
    const regex = new RegExp(pattern);
    for (const path of testPaths) {
      console.log(`  ${path}: ${regex.test(path) ? 'MATCHES' : 'no match'}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}
