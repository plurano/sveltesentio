import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { GIT_DEADLINE_MS, TRACKED_CAP, trackedFiles } from './git-tracked.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('trackedFiles', () => {
	it('lists a known tracked file at the repository root', { timeout: 20_000 }, () => {
		assert.ok(GIT_DEADLINE_MS > 0);
		assert.ok(TRACKED_CAP > 0);
		assert.deepEqual(trackedFiles(root, ['package.json']), ['package.json']);
	});

	it('returns an empty list when no tracked file matches the glob', { timeout: 20_000 }, () => {
		assert.deepEqual(trackedFiles(root, ['no-such-tracked-file.nope']), []);
	});

	it('enforces the cap boundary on a two-file listing', { timeout: 20_000 }, () => {
		const pair = ['package.json', 'pnpm-workspace.yaml'];
		assert.deepEqual(trackedFiles(root, pair, 2), pair);
		assert.throws(() => trackedFiles(root, pair, 1), /above the cap of 1/);
	});

	it('throws when the directory is outside any git repository', { timeout: 20_000 }, () => {
		const outside = mkdtempSync(join(tmpdir(), 'git-tracked-'));
		try {
			assert.throws(() => trackedFiles(outside));
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});
});
