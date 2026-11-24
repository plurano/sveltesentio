#!/usr/bin/env node
// Runs `node --test` on the files a glob matches and fails when it matches none.
//
// `node --test <glob>` exits 0 when the glob matches nothing, so a deleted suite
// would leave the task green. The earlier `ls <glob> > /dev/null` guard did the
// matching in the shell, and pnpm runs scripts through cmd.exe on Windows, where
// `/dev/null` does not exist (HISS-21). Matching here keeps one form on every OS.
import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The CI Lint job's 10-minute limit is the tighter bound there; this one stops
// a hung local or hook run (HISS-02).
export const TEST_RUN_DEADLINE_MS = 20 * 60_000;

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
 * Runs the test files the globs match before `deadlineMs` elapses and returns
 * the exit status.
 *
 * @param {string[]} patterns
 * @param {string} cwd
 * @param {number} [deadlineMs]
 * @returns {number}
 */
export function runTests(patterns, cwd, deadlineMs = TEST_RUN_DEADLINE_MS) {
	if (patterns.length === 0) {
		console.error('node-test: no glob given');
		return 2;
	}
	if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) {
		console.error('node-test: deadline must be a positive whole number of milliseconds');
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
	// SIGTERM, not SIGKILL: the runner stops the per-file child it spawned only
	// when it gets the chance, and a killed runner leaves that child running.
	const result = spawnSync(process.execPath, ['--test', ...files], {
		cwd,
		env,
		stdio: 'inherit',
		timeout: deadlineMs,
		killSignal: 'SIGTERM',
	});
	if (result.error) {
		if (result.error.code === 'ETIMEDOUT') {
			console.error(`node-test: tests ran past the deadline of ${deadlineMs} ms`);
		} else {
			console.error(`node-test: ${result.error.message}`);
		}
		return 1;
	}
	return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = runTests(process.argv.slice(2), process.cwd());
}
