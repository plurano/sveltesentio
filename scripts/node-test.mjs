#!/usr/bin/env node
// Runs `node --test` on the files a glob matches and fails when it matches none.
//
// `node --test <glob>` exits 0 when the glob matches nothing, so a deleted suite
// would leave the task green. The earlier `ls <glob> > /dev/null` guard did the
// matching in the shell, and pnpm runs scripts through cmd.exe on Windows, where
// `/dev/null` does not exist (HISS-21). Matching here keeps one form on every OS.
import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

// The CI Lint job's 10-minute limit is the tighter bound there; this one stops
// a hung local or hook run (HISS-02).
export const TEST_RUN_DEADLINE_MS = 20 * 60_000;

// How long the runner gets to stop its own test process after SIGTERM before
// SIGKILL ends it.
export const KILL_GRACE_MS = 10_000;

// Node sets a longer timer, spawn's `timeout` included, to 1 ms, which would
// end the run at once.
export const TIMER_MAX_MS = 2 ** 31 - 1;

/**
 * The sorted files that the globs match, relative to `cwd`.
 *
 * @param {string[]} patterns
 * @param {string} cwd
 * @returns {string[]}
 */
export function matchTests(patterns, cwd) {
	return [...new Set(patterns.flatMap((pattern) => globSync(pattern, { cwd })))].sort();
}

/**
 * Returns the CLI usage error for invalid `runTests` arguments, or `null` when
 * every argument is valid.
 *
 * @param {string[]} patterns
 * @param {number} deadlineMs
 * @param {number} graceMs
 * @returns {string | null}
 */
function validate(patterns, deadlineMs, graceMs) {
	if (patterns.length === 0) {
		return 'node-test: no glob given';
	}
	if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) {
		return 'node-test: deadline must be a positive whole number of milliseconds';
	}
	if (!Number.isSafeInteger(graceMs) || graceMs <= 0) {
		return 'node-test: grace must be a positive whole number of milliseconds';
	}
	if (deadlineMs + graceMs > TIMER_MAX_MS) {
		return `node-test: deadline and grace together must not pass ${TIMER_MAX_MS} ms`;
	}
	return null;
}

/**
 * Spawns `node --test` on `files`, sends `SIGTERM` at `deadlineMs` and lets
 * Node's `SIGKILL` timeout end a blocked runner after `graceMs`.
 *
 * @param {string[]} files
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @param {number} deadlineMs
 * @param {number} graceMs
 * @returns {Promise<number>}
 */
function run(files, cwd, env, deadlineMs, graceMs) {
	return new Promise((resolve) => {
		// SIGTERM first because a killed runner leaves its test process running;
		// SIGKILL after the grace because a runner whose event loop is blocked (for
		// example a synchronous loop under --test-isolation=none) never runs its
		// SIGTERM handler.
		const child = spawn(process.execPath, ['--test', ...files], {
			cwd,
			env,
			stdio: 'inherit',
			timeout: deadlineMs + graceMs,
			killSignal: 'SIGKILL',
		});
		let timedOut = false;
		let settled = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
		}, deadlineMs);
		child.on('error', (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			console.error(`node-test: ${error.message}`);
			resolve(1);
		});
		child.on('close', (status) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (timedOut) {
				console.error(`node-test: tests ran past the deadline of ${deadlineMs} ms`);
				resolve(1);
				return;
			}
			resolve(status ?? 1);
		});
	});
}

/**
 * Runs the test files the globs match before `deadlineMs` elapses, giving a
 * timed-out runner `graceMs` after `SIGTERM` before `SIGKILL` ends it, and
 * resolves to the exit status.
 *
 * @param {string[]} patterns
 * @param {string} cwd
 * @param {number} [deadlineMs]
 * @param {number} [graceMs]
 * @returns {Promise<number>}
 */
export async function runTests(
	patterns,
	cwd,
	deadlineMs = TEST_RUN_DEADLINE_MS,
	graceMs = KILL_GRACE_MS,
) {
	const problem = validate(patterns, deadlineMs, graceMs);
	if (problem !== null) {
		console.error(problem);
		return 2;
	}
	const files = matchTests(patterns, cwd);
	if (files.length === 0) {
		console.error(`node-test: no test file matches ${patterns.join(' ')}`);
		return 1;
	}
	// An inherited NODE_TEST_CONTEXT turns the child into a reporter for a parent run, which exits 0.
	const env = { ...process.env };
	delete env.NODE_TEST_CONTEXT;
	return await run(files, cwd, env, deadlineMs, graceMs);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = await runTests(process.argv.slice(2), process.cwd());
}
