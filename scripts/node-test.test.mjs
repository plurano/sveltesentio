import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { matchTests, runTests, TIMER_MAX_MS } from './node-test.mjs';

const dir = mkdtempSync(join(tmpdir(), 'node-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** Writes one test file under `dir` and returns the directory it sits in. */
function fixture(name, body) {
	const sub = join(dir, name);
	mkdirSync(join(sub, 'cases'), { recursive: true });
	writeFileSync(join(sub, 'cases', 'a.test.mjs'), `import { test } from 'node:test';\n${body}\n`);
	return sub;
}

/** Whether the process `pid` still runs, polled for up to five seconds. */
async function outlives(pid) {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			process.kill(pid, 0);
		} catch (error) {
			if (error.code === 'ESRCH') return false;
			throw new Error(`probing pid ${pid} failed`, { cause: error });
		}
		await sleep(100);
	}
	return true;
}

describe('matchTests', () => {
	it('returns each match once, sorted, for overlapping globs', () => {
		const sub = fixture('match', "test('ok', () => {});");
		writeFileSync(join(sub, 'cases', 'b.test.mjs'), '');
		const files = matchTests(['cases/*.test.mjs', 'cases/a.test.mjs'], sub);
		assert.deepEqual(files, [join('cases', 'a.test.mjs'), join('cases', 'b.test.mjs')]);
	});
});

describe('runTests', () => {
	it('passes when the matched tests pass', async () => {
		const sub = fixture('pass', "test('ok', () => {});");
		assert.equal(await runTests(['cases/*.test.mjs'], sub), 0);
	});

	it('fails when a matched test fails', async () => {
		const sub = fixture('fail', "test('bad', () => { throw new Error('planted'); });");
		assert.notEqual(await runTests(['cases/*.test.mjs'], sub), 0);
	});

	it('fails when the glob matches no file', async () => {
		assert.equal(await runTests(['cases/*.test.mjs'], dir), 1);
	});

	it('fails when no glob is given', async () => {
		assert.equal(await runTests([], dir), 2);
	});

	it('passes when matched tests finish within the deadline', { timeout: 20_000 }, async () => {
		const sub = fixture('within-deadline', "test('ok', () => {});");
		assert.equal(await runTests(['cases/*.test.mjs'], sub, 60_000), 0);
	});

	// Without the deadline this run hangs; the message tells the deadline path
	// from any other failure.
	it('fails once a hung test runs past its deadline', { timeout: 20_000 }, async (t) => {
		const body = "test('hang', () => new Promise(() => { setTimeout(() => {}, 30_000); }));";
		const sub = fixture('hang', body);
		const errors = t.mock.method(console, 'error', () => {});
		assert.equal(await runTests(['cases/*.test.mjs'], sub, 500), 1);
		assert.deepEqual(
			errors.mock.calls.map((call) => call.arguments[0]),
			['node-test: tests ran past the deadline of 500 ms'],
		);
	});

	// Without the SIGKILL backstop this run never ends: the spin blocks the runner's SIGTERM handler.
	it(
		'ends a runner that cannot handle SIGTERM once the grace passes',
		{ timeout: 20_000 },
		async (t) => {
			const sub = fixture('spin', "test('spin', () => { for (;;) {} });");
			const errors = t.mock.method(console, 'error', () => {});
			const previous = process.env.NODE_OPTIONS;
			process.env.NODE_OPTIONS = '--test-isolation=none';
			try {
				assert.equal(await runTests(['cases/*.test.mjs'], sub, 500, 500), 1);
			} finally {
				if (previous === undefined) {
					delete process.env.NODE_OPTIONS;
				} else {
					process.env.NODE_OPTIONS = previous;
				}
			}
			assert.deepEqual(
				errors.mock.calls.map((call) => call.arguments[0]),
				['node-test: tests ran past the deadline of 500 ms'],
			);
		},
	);

	// Windows ends a timed-out child with TerminateProcess, which gives the runner
	// no chance to stop its own child; this check needs a catchable signal.
	const signals = process.platform === 'win32' ? 'Windows has no catchable kill signal' : false;
	it(
		'leaves no test process behind after the deadline',
		{ timeout: 20_000, skip: signals },
		async (t) => {
			const body = [
				"import { writeFileSync } from 'node:fs';",
				"writeFileSync('pid.txt', String(process.pid));",
				"test('hang', () => new Promise(() => { setTimeout(() => {}, 30_000); }));",
			].join('\n');
			const sub = fixture('orphan', body);
			const errors = t.mock.method(console, 'error', () => {});
			// The deadline covers runner and fixture start-up on a cold CI runner.
			assert.equal(await runTests(['cases/*.test.mjs'], sub, 5_000), 1);
			assert.equal(errors.mock.callCount(), 1);
			const pid = Number(readFileSync(join(sub, 'pid.txt'), 'utf8'));
			assert.ok(Number.isSafeInteger(pid) && pid > 1, `fixture wrote pid ${pid}`);
			assert.equal(await outlives(pid), false, `test process ${pid} outlived the runner`);
		},
	);

	it('refuses a deadline that is not a positive safe integer', { timeout: 20_000 }, async () => {
		const sub = fixture('bad-deadline', "test('ok', () => {});");
		for (const bad of [0, -1, 1.5, NaN]) {
			assert.equal(await runTests(['cases/*.test.mjs'], sub, bad), 2);
		}
	});

	it('refuses a grace that is not a positive safe integer', { timeout: 20_000 }, async (t) => {
		const sub = fixture('bad-grace', "test('ok', () => {});");
		const errors = t.mock.method(console, 'error', () => {});
		for (const bad of [0, -1, 1.5, NaN]) {
			assert.equal(await runTests(['cases/*.test.mjs'], sub, 60_000, bad), 2);
		}
		assert.deepEqual(
			errors.mock.calls.map((call) => call.arguments[0]),
			Array(4).fill('node-test: grace must be a positive whole number of milliseconds'),
		);
	});

	// Node runs a longer timer after 1 ms, so a run past the limit would end at once.
	it(
		'accepts a deadline and grace up to the timer limit and refuses one past it',
		{ timeout: 20_000 },
		async (t) => {
			const sub = fixture('timer-limit', "test('ok', () => {});");
			const errors = t.mock.method(console, 'error', () => {});
			assert.equal(await runTests(['cases/*.test.mjs'], sub, TIMER_MAX_MS - 1_000, 1_000), 0);
			assert.equal(await runTests(['cases/*.test.mjs'], sub, TIMER_MAX_MS - 1_000, 1_001), 2);
			assert.deepEqual(
				errors.mock.calls.map((call) => call.arguments[0]),
				[`node-test: deadline and grace together must not pass ${TIMER_MAX_MS} ms`],
			);
		},
	);
});
