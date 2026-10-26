// Unit tests for __MODULE__ (node:test). Run: node .claude/tools/run-tests.js __PROJECT__/tests
// TDD: write ONE test, run it and watch it fail, make it pass, then refactor. Repeat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { exampleFunction } = require('../__MODULE__'); // module must export via module.exports (see testing skill)

test('__MODULE__: describes one behaviour in plain words', () => {
  // Arrange
  const input = 'replace me';
  // Act
  const result = exampleFunction(input);
  // Assert
  assert.equal(result, 'expected value');
});

test('__MODULE__: handles an edge case (empty / invalid / boundary input)', () => {
  assert.throws(() => exampleFunction(undefined), /expected error message/);
});
