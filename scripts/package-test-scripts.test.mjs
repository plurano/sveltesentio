import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from './git-tracked.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * Lets a test run that found no test file pass: with it, a deleted suite or an
 * include glob that matches nothing leaves the test task green.
 */
const PASS_WITH_NO_TESTS = /--passWithNoTests\b|--pass-with-no-tests\b|\bpassWithNoTests\s*:/;

/** The scripts of one package.json text that let an empty test run pass. */
function scriptsPassingWithNoTests(text) {
	const scripts = JSON.parse(text).scripts ?? {};
	return Object.entries(scripts)
		.filter(([, command]) => PASS_WITH_NO_TESTS.test(command))
		.map(([name]) => name);
}

describe('scriptsPassingWithNoTests', () => {
	it('finds the flag in either spelling', () => {
		const text = JSON.stringify({
			scripts: {
				test: 'vitest run --coverage --passWithNoTests',
				'test:unit': 'vitest run --pass-with-no-tests',
				build: 'vite build',
			},
		});
		assert.deepEqual(scriptsPassingWithNoTests(text), ['test', 'test:unit']);
	});

	it('accepts a package without the flag or without scripts', () => {
		assert.deepEqual(scriptsPassingWithNoTests('{"scripts":{"test":"vitest run --coverage"}}'), []);
		assert.deepEqual(scriptsPassingWithNoTests('{}'), []);
	});
});

describe('workspace test runs fail when they find no test', () => {
	it('no package or app script passes with no tests', () => {
		const files = trackedFiles(root, ['packages/*/package.json', 'apps/*/package.json']);
		assert.ok(files.length > 0, 'no package.json found');
		const findings = files.flatMap((file) =>
			scriptsPassingWithNoTests(readFileSync(join(root, file), 'utf8')).map(
				(name) => `${file}: scripts.${name}`,
			),
		);
		assert.deepEqual(findings, []);
	});

	it('no vitest config sets passWithNoTests', () => {
		const files = trackedFiles(root, [
			'packages/*/vitest.config.*',
			'apps/*/vitest.config.*',
			'vitest.config.*',
		]);
		assert.ok(files.length > 0, 'no vitest config found');
		const findings = files.filter((file) =>
			PASS_WITH_NO_TESTS.test(readFileSync(join(root, file), 'utf8')),
		);
		assert.deepEqual(findings, []);
	});
});
