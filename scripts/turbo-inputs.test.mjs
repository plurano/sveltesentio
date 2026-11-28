import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const turbo = join(root, 'node_modules', '.bin', 'turbo');

/**
 * Files outside its own folder that a package task reads, one sample per glob
 * in that package's turbo.json. Turbo hashes only the package folder by
 * default, so without these inputs a change to one of the files left the
 * cached green result of the task in place.
 */
const READS_OUTSIDE_PACKAGE = {
	'@sveltesentio/testing#test': [
		'.github/workflows/ci.yml',
		'.github/workflows/codeql.yml',
		'scripts/ci-affected.mjs',
		'scripts/check-docs-drift.mjs',
		'renovate.json',
	],
	'@sveltesentio/mcp#test': [
		'docs/adr/README.md',
		'docs/compliance/owasp-asvs-l2.md',
		'docs/compose/admin-ui-patterns.md',
		'docs/principles.md',
		'packages/core/AGENTS.md',
		'packages/core/package.json',
	],
	'@sveltesentio/docs#build': [
		'docs/principles.md',
		'docs/adr/README.md',
		'packages/core/package.json',
	],
};

/**
 * Directories outside its own folder that a package task reads in full; every
 * `.md` file directly inside must be hashed, so a narrowed input list fails.
 */
const READS_WHOLE_DIRECTORY = {
	'@sveltesentio/ui#test': ['docs/compose'],
};

/** Upper bound on `.md` files per whole-read directory; past it the test fails instead of truncating. */
const MAX_DIR_FILES = 1000;

/** The files turbo hashes for one `package#task`, relative to the root. */
function taskInputs(taskId) {
	const [pkg, name] = taskId.split('#');
	const out = execFileSync(turbo, ['run', name, `--filter=${pkg}`, '--dry=json'], {
		cwd: root,
		encoding: 'utf8',
		env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
		maxBuffer: 16 * 1024 * 1024,
		timeout: 60_000,
	});
	const task = JSON.parse(out).tasks.find((entry) => entry.taskId === taskId);
	assert.ok(task, `turbo planned no task ${taskId}`);
	return Object.keys(task.inputs).map((file) => join(task.directory, file).replaceAll('\\', '/'));
}

describe('turbo task inputs', () => {
	for (const [taskId, files] of Object.entries(READS_OUTSIDE_PACKAGE)) {
		it(`hashes the files outside the package that ${taskId} reads`, () => {
			const inputs = taskInputs(taskId);
			for (const file of files) {
				assert.ok(existsSync(join(root, file)), `${file} no longer exists; update this list`);
				assert.ok(inputs.includes(file), `${taskId} does not hash ${file}`);
			}
		});
	}

	for (const [taskId, dirs] of Object.entries(READS_WHOLE_DIRECTORY)) {
		it(`hashes every .md file in the directories that ${taskId} reads`, () => {
			const inputs = new Set(taskInputs(taskId));
			for (const dir of dirs) {
				const mdFiles = readdirSync(join(root, dir)).filter((name) => name.endsWith('.md'));
				assert.ok(mdFiles.length > 0, `${dir} contains no .md files; update this list`);
				assert.ok(
					mdFiles.length <= MAX_DIR_FILES,
					`${dir} holds more than ${MAX_DIR_FILES} .md files`,
				);
				for (const name of mdFiles) {
					assert.ok(inputs.has(`${dir}/${name}`), `${taskId} does not hash ${dir}/${name}`);
				}
			}
		});
	}

	it('keeps the files of the package itself', () => {
		assert.ok(taskInputs('@sveltesentio/testing#test').includes('packages/testing/package.json'));
	});

	it('does not hash those files for a package that does not read them', () => {
		const inputs = taskInputs('@sveltesentio/core#test');
		assert.ok(!inputs.includes('.github/workflows/ci.yml'));
		assert.ok(!inputs.includes('docs/principles.md'));
	});
});
