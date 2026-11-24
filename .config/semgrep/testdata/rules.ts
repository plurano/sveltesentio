// Fixtures for .semgrep.yml: `ruleid:` lines must be reported, `ok:` lines must not.
import { exec, execFile, execFileSync, execSync, fork, spawn, spawnSync } from 'node:child_process';
import * as cp from 'child_process';
import { promisify } from 'node:util';

declare const input: string;
declare const host: HTMLElement;
declare function sanitizeHtml(raw: string): string;

export function dynamicCode(): unknown {
	// ruleid: no-eval
	eval(input);
	// ruleid: no-function-constructor
	const fn = new Function(input);
	// ruleid: no-string-timer
	setTimeout('tick()', 10);
	// ok: no-string-timer
	setTimeout(() => fn(), 10);
	// ok: no-eval
	return JSON.parse(input);
}

export function processes(): void {
	// ruleid: no-shell-child-process
	exec(`ls ${input}`, { timeout: 1_000 });
	// ruleid: no-shell-child-process
	cp.execSync(input, { timeout: 1_000 });
	// ruleid: no-shell-child-process
	spawn('sh', ['-c', input], { shell: true, timeout: 1_000 });
	// ok: no-shell-child-process
	spawn('git', ['status'], { shell: false, timeout: 1_000 });
	// ok: no-shell-child-process
	execFile('git', ['log', input], { timeout: 1_000 });
	// ok: no-shell-child-process
	/^(\d+)$/.exec(input);
}

export function processDeadlines(): void {
	// ruleid: child-process-deadline
	execFileSync('git', ['status']);
	// ruleid: child-process-deadline
	spawnSync('git', ['status']);
	// ruleid: child-process-deadline
	execSync('git status', { shell: false });
	// ruleid: child-process-deadline
	execFile('git', ['status']);
	// ruleid: child-process-deadline
	spawn('git', ['status']);
	// ruleid: child-process-deadline
	fork('./worker.js');
	// ruleid: child-process-deadline
	cp.spawnSync('git', ['status']);
	// ruleid: child-process-deadline
	promisify(execFile)('git', ['status']);
	const run = promisify(execFile);
	// ruleid: child-process-deadline
	run('git', ['status']);
	const opts = { cwd: '.' };
	// ruleid: child-process-deadline
	execFileSync('git', [], opts);
	// ok: child-process-deadline
	execFileSync('git', ['status'], { timeout: 1_000 });
	const timeout = 1_000;
	// ok: child-process-deadline
	spawnSync('git', ['status'], { timeout });
	const base = { cwd: '.' };
	// ok: child-process-deadline
	execFileSync('git', ['status'], { ...base, timeout: 1_000 });
	// ok: child-process-deadline
	execFile('git', ['log'], { timeout: 1_000 }, () => undefined);
	// ok: child-process-deadline
	promisify(execFile)('git', ['status'], { timeout: 1_000 });
	// ok: child-process-deadline
	run('git', ['status'], { timeout: 1_000 });
	// ok: child-process-deadline
	/^(\d+)$/.exec(input);
}

export function sinks(): void {
	// ruleid: no-unsanitised-html-sink
	host.innerHTML = input;
	// ruleid: no-unsanitised-html-sink
	host.insertAdjacentHTML('beforeend', input);
	// ok: no-unsanitised-html-sink
	host.innerHTML = sanitizeHtml(input);
	// ok: no-unsanitised-html-sink
	host.innerHTML = '';
	// ok: no-unsanitised-html-sink
	host.textContent = input;
}
