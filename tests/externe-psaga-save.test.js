const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

for (const file of ['app.src.js', 'app.js']) {
  test(`${file}: save validation uses the declared missing-field variable`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(
      source,
      /const fehlt\s*=\s*pflicht\.find\(\(\[id\]\)\s*=>\s*!externeFeld\(id\)\);\s*if\s*\(fehlt\)/,
      'The save handler must use the declared variable "fehlt".'
    );
    assert.doesNotMatch(
      source,
      /const fehlt\s*=\s*pflicht\.find[\s\S]{0,180}if\s*\(fehl\)/,
      'The save handler must not reference the undeclared variable "fehl".'
    );
  });
}
