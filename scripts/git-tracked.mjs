// Lists the git-tracked files of a repository root so every test that inspects
// the tracked tree shares one implementation (HISS-19) with an explicit child
// deadline and output cap (HISS-02).
import { execFileSync } from 'node:child_process';

/** Maximum wall-clock time in milliseconds for one `git ls-files` call. */
export const GIT_DEADLINE_MS = 10_000;

/** Default upper bound on the number of tracked paths `trackedFiles` returns. */
export const TRACKED_CAP = 10_000;

/**
 * Lists tracked repository files under `root`, optionally filtered by git pathspecs.
 *
 * @param {string} root
 * @param {string[]} [globs]
 * @param {number} [cap]
 * @returns {string[]}
 */
export function trackedFiles(root, globs = [], cap = TRACKED_CAP) {
	const args = globs.length > 0 ? ['ls-files', '-z', '--', ...globs] : ['ls-files', '-z'];
	const out = execFileSync('git', args, {
		cwd: root,
		encoding: 'utf8',
		timeout: GIT_DEADLINE_MS,
	});
	const files = out.split('\0').filter((file) => file !== '');
	if (files.length > cap) {
		throw new Error(`git ls-files listed ${files.length} files, above the cap of ${cap}`);
	}
	return files;
}
