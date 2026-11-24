// Fixtures for .semgrep.yml in CommonJS: the require binding of child_process.
const cp = require('node:child_process');

function run(input) {
	// ruleid: no-shell-child-process
	cp.exec(input, { timeout: 1_000 });
	// ruleid: no-shell-child-process
	cp.spawnSync('sh', ['-c', input], { shell: '/bin/sh', timeout: 1_000 });
	// ok: no-shell-child-process
	cp.execFileSync('git', ['log', input], { timeout: 1_000 });
	// ruleid: child-process-deadline
	cp.execFileSync('git', ['log', input]);
	// ok: child-process-deadline
	cp.execFileSync('git', ['log', input], { timeout: 1_000 });
	// ruleid: no-eval
	return eval(input);
}

module.exports = { run };
