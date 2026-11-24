// Fixtures for .semgrep.yml in an ES module: an aliased named import of
// child_process, dynamic imports of it, and a local function that shares a
// child_process name.
import { execFile as runFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

function spawn(name) {
	return name;
}

export function run(input) {
	// ruleid: child-process-deadline
	execFileSync('git', ['log', input]);
	// ok: child-process-deadline
	execFileSync('git', ['log', input], { timeout: 1_000 });
	// ruleid: child-process-deadline
	runFile('git', ['log', input]);
	// ruleid: child-process-deadline
	promisify(runFile)('git', ['log', input]);
	// ok: child-process-deadline
	runFile('git', ['log', input], { timeout: 1_000 }, () => undefined);
	// ok: child-process-deadline
	return spawn(input);
}

export async function load(input) {
	const { fork } = await import('node:child_process');
	const cp = await import('child_process');
	// ruleid: child-process-deadline
	fork(input);
	// ok: child-process-deadline
	fork(input, [], { timeout: 1_000 });
	// ruleid: child-process-deadline
	cp.spawnSync('git', ['log', input]);
	// ok: child-process-deadline
	return cp.spawnSync('git', ['log', input], { timeout: 1_000 });
}
