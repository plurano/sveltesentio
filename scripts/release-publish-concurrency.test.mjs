// Holds the release workflow to its publish concurrency promise: the job that
// publishes to npm declares a constant job-level concurrency group with
// cancel-in-progress kept false, so push runs and manual runs serialize rather
// than racing to publish the same versions or cutting a publish midway. Reads
// release-please.yml by indentation, the way release-sbom.test.mjs reads steps.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const workflow = join(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
	'.github',
	'workflows',
	'release-please.yml',
);

const STEP_START = '      - ';
const STEP_BODY = '        ';
const GROUP_KEY = /^ {6}group:(.*)$/;
const CANCEL_KEY = /^ {6}cancel-in-progress:(.*)$/;
const BLOCK_KEY = /^ {6}([A-Za-z0-9_-]+):/;
const READ_KEYS = new Set(['group', 'cancel-in-progress']);
// Allow-list: the reader understands a group that starts as a plain scalar.
// Flow mappings, block scalars, anchors, aliases and tags start otherwise
// and are refused, so a form it cannot read never passes unread.
const PLAIN_VALUE = /^[A-Za-z0-9_$]/;
// Allow-list: the only expression a group may carry is github.workflow, which
// is the same for every run of this workflow. Every other expression could
// differ between runs and split publishers that must serialize, so it is
// refused, and so is a `${{` the reader cannot pair with its `}}`.
const EXPRESSION = /\$\{\{(.*?)\}\}/g;
const CONSTANT_EXPRESSIONS = new Set(['github.workflow']);

/** Scalar text after a YAML colon, with quotes and trailing comments removed. */
function stripComment(raw) {
	const trimmed = raw.trim();
	if (trimmed.startsWith('#')) return '';
	const quoted = /^(['"])(.*?)\1(?:\s+#.*)?$/.exec(trimmed);
	if (quoted !== null) return quoted[2].trim();
	return trimmed.replace(/\s+#.*$/, '');
}

/** Non-empty, non-comment lines inside the top-level `jobs:` mapping. */
function jobsSectionLines(source) {
	const collected = [];
	let inJobs = false;
	for (const line of source.split(/\r?\n/)) {
		if (/^\s*(#.*)?$/.test(line)) continue;
		if (!line.startsWith(' ')) {
			inJobs = /^jobs:\s*(#.*)?$/.test(line);
		} else if (inJobs) {
			collected.push(line);
		}
	}
	return collected;
}

/** Jobs under `jobs:`, each with its 2-space key and >=4-space body lines. */
function parseJobs(source) {
	const jobs = [];
	for (const line of jobsSectionLines(source)) {
		const header = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
		if (header !== null) {
			jobs.push({ name: header[1], lines: [] });
		} else if (jobs.length > 0 && line.startsWith('    ')) {
			jobs.at(-1).lines.push(line);
		}
	}
	return jobs;
}

/** Steps inside a job's `steps:` mapping, each as the list of its lines. */
function jobSteps(jobLines) {
	const found = [];
	let inSteps = false;
	for (const line of jobLines) {
		if (/^ {4}[^ ]/.test(line)) {
			inSteps = /^ {4}steps:\s*(#.*)?$/.test(line);
		} else if (inSteps && line.startsWith(STEP_START)) {
			found.push([line]);
		} else if (inSteps && found.length > 0 && line.startsWith(STEP_BODY)) {
			found.at(-1).push(line);
		}
	}
	return found;
}

/** Job-level `concurrency:` entries, each with inline scalar and 6-space block lines. */
function concurrencyEntries(jobLines) {
	const entries = [];
	let active = null;
	for (const line of jobLines) {
		if (/^ {4}[^ ]/.test(line)) {
			const match = /^ {4}concurrency:(.*)$/.exec(line);
			active = match !== null ? { inline: stripComment(match[1]), block: [] } : null;
			if (active !== null) entries.push(active);
		} else if (active !== null && line.startsWith('      ')) {
			active.block.push(line);
		}
	}
	return entries;
}

function groupFindings(group) {
	if (!PLAIN_VALUE.test(group)) return [`concurrency group form not read (${group})`];
	const findings = [];
	for (const match of group.matchAll(EXPRESSION)) {
		const inner = match[1].trim();
		if (!CONSTANT_EXPRESSIONS.has(inner)) {
			findings.push(`concurrency group expression not allowed (${inner})`);
		}
	}
	if (group.replace(EXPRESSION, '').includes('${{')) {
		findings.push(`concurrency group expression not read (${group})`);
	}
	return findings;
}

function blockGroupFindings(block) {
	const groups = block.map((line) => GROUP_KEY.exec(line)).filter((match) => match !== null);
	if (groups.length === 0) return ['concurrency block has no group'];
	const findings = [];
	for (const match of groups) {
		const value = stripComment(match[1]);
		if (value === '') {
			findings.push('concurrency block has no group');
		} else {
			findings.push(...groupFindings(value));
		}
	}
	return findings;
}

/** Block lines other than the keys this reader understands. */
function blockKeyFindings(block) {
	const findings = [];
	for (const line of block) {
		const key = BLOCK_KEY.exec(line);
		if (key === null) {
			findings.push(`concurrency line not read (${line.trim()})`);
		} else if (!READ_KEYS.has(key[1])) {
			findings.push(`concurrency key not read (${key[1]})`);
		}
	}
	return findings;
}

function blockConcurrencyFindings(block) {
	const findings = [...blockKeyFindings(block), ...blockGroupFindings(block)];
	for (const line of block) {
		if (CANCEL_KEY.test(line) && !/^ {6}cancel-in-progress:\s*false\s*(#.*)?$/.test(line)) {
			findings.push(`cancel-in-progress must be false (${line.trim()})`);
		}
	}
	return findings;
}

function jobConcurrencyFindings(job) {
	const entries = concurrencyEntries(job.lines);
	if (entries.length === 0) {
		return [`job ${job.name} has no job-level concurrency`];
	}
	const findings = [];
	if (entries.length > 1) {
		findings.push(`job ${job.name} declares concurrency more than once`);
	}
	for (const entry of entries) {
		if (entry.inline !== '' && entry.block.length === 0) {
			findings.push(...groupFindings(entry.inline));
		} else if (entry.inline !== '') {
			findings.push('concurrency mixes scalar and block forms');
		} else {
			findings.push(...blockConcurrencyFindings(entry.block));
		}
	}
	return findings;
}

const isPublish = (step) => step.some((line) => /\bpnpm (-r )?publish\b/.test(line));

/** Every reason the publish job breaks its concurrency promise; empty when it holds. */
export function publishConcurrencyFindings(source) {
	const publishJobs = parseJobs(source).filter((job) => jobSteps(job.lines).some(isPublish));
	if (publishJobs.length === 0) return ['no publish step'];
	return publishJobs.flatMap(jobConcurrencyFindings);
}

function publishJob(concurrency = '') {
	return [
		'jobs:',
		'  release-please:',
		...(concurrency === '' ? [] : [concurrency]),
		'    runs-on: ubuntu-26.04',
		'    steps:',
		'      - name: Publish packages to npm',
		'        run: pnpm -r publish --no-git-checks --access public',
	].join('\n');
}

function concurrencyBlock(...lines) {
	return ['    concurrency:', ...lines.map((line) => `      ${line}`)].join('\n');
}

const nonPublishWorkflow = [
	'jobs:',
	'  lint:',
	'    runs-on: ubuntu-26.04',
	'    steps:',
	'      - run: pnpm install --frozen-lockfile',
].join('\n');

const otherJobOnlyWorkflow = [
	'jobs:',
	'  format-release-pr:',
	'    concurrency:',
	'      group: release-pr-format',
	'      cancel-in-progress: false',
	'    steps:',
	'      - run: pnpm exec prettier --check .',
	'  release-please:',
	'    runs-on: ubuntu-26.04',
	'    steps:',
	'      - run: pnpm -r publish --access public',
].join('\n');

describe('release-please.yml publish concurrency: positive', () => {
	it('holds for the workflow in this repository', () => {
		assert.deepEqual(publishConcurrencyFindings(readFileSync(workflow, 'utf8')), []);
	});
});

describe('release-please.yml publish concurrency: negative', () => {
	it('refuses a publish job without job-level concurrency', () => {
		assert.deepEqual(publishConcurrencyFindings(publishJob()), [
			'job release-please has no job-level concurrency',
		]);
	});

	it('refuses cancel-in-progress: true', () => {
		const block = concurrencyBlock('group: release-please-publish', 'cancel-in-progress: true');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
			'cancel-in-progress must be false (cancel-in-progress: true)',
		]);
	});

	it('refuses an expression-valued cancel-in-progress', () => {
		const expr = "cancel-in-progress: ${{ github.event_name == 'push' }}";
		const block = concurrencyBlock('group: release-please-publish', expr);
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
			`cancel-in-progress must be false (${expr})`,
		]);
	});

	it('refuses every group expression other than github.workflow', () => {
		const groups = [
			['${{ github.run_id }}', 'github.run_id'],
			['publish-${{ github.event_name }}', 'github.event_name'],
			['publish-${{ github.run_number }}', 'github.run_number'],
			['publish-${{ github.run_attempt }}', 'github.run_attempt'],
			['publish-${{ github.sha }}', 'github.sha'],
			['publish-${{ github.event.after }}', 'github.event.after'],
			['publish-${{ github.ref }}', 'github.ref'],
			["publish-${{ github['run_id'] }}", "github['run_id']"],
			['publish-${{ GITHUB.WORKFLOW }}', 'GITHUB.WORKFLOW'],
			['publish-${{ github.workflow }}-${{ github.run_id }}', 'github.run_id'],
		];
		for (const [group, expression] of groups) {
			const block = concurrencyBlock(`group: ${group}`, 'cancel-in-progress: false');
			assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
				`concurrency group expression not allowed (${expression})`,
			]);
		}
	});

	it('refuses an expression it cannot pair', () => {
		const block = concurrencyBlock(
			'group: publish-${{ github.workflow',
			'cancel-in-progress: false',
		);
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
			'concurrency group expression not read (publish-${{ github.workflow)',
		]);
	});

	it('refuses a concurrency block without group', () => {
		const block = concurrencyBlock('cancel-in-progress: false');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
			'concurrency block has no group',
		]);
	});

	it('refuses a flow mapping it does not read', () => {
		const flow = '    concurrency: { group: release-please-publish, cancel-in-progress: true }';
		assert.deepEqual(publishConcurrencyFindings(publishJob(flow)), [
			'concurrency group form not read ({ group: release-please-publish, cancel-in-progress: true })',
		]);
	});

	it('refuses a block scalar group it does not read', () => {
		const block = concurrencyBlock('group: >-', '  publish-${{ github.run_id }}');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
			'concurrency line not read (publish-${{ github.run_id }})',
			'concurrency group form not read (>-)',
		]);
	});

	it('refuses a concurrency key it does not read', () => {
		const block = concurrencyBlock('group: release-please-publish', 'queue: max');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), [
			'concurrency key not read (queue)',
		]);
	});

	it('refuses a workflow without a publish step', () => {
		assert.deepEqual(publishConcurrencyFindings(nonPublishWorkflow), ['no publish step']);
	});
});

describe('release-please.yml publish concurrency: boundary', () => {
	it('accepts a concurrency block when cancel-in-progress is absent', () => {
		const block = concurrencyBlock('group: release-please-publish');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), []);
	});

	it('accepts an explicit cancel-in-progress: false', () => {
		const block = concurrencyBlock('group: release-please-publish', 'cancel-in-progress: false');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), []);
	});

	it('accepts a constant workflow expression in group', () => {
		const block = concurrencyBlock(
			'group: ${{ github.workflow }}-publish',
			'cancel-in-progress: false',
		);
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), []);
	});

	it('accepts the workflow expression without inner spaces', () => {
		const block = concurrencyBlock('group: ${{github.workflow}}-publish');
		assert.deepEqual(publishConcurrencyFindings(publishJob(block)), []);
	});

	it('accepts string shorthand concurrency as group with cancel-in-progress false', () => {
		const shorthand = '    concurrency: release-please-publish';
		assert.deepEqual(publishConcurrencyFindings(publishJob(shorthand)), []);
	});

	it('refuses concurrency declared only on a different job', () => {
		assert.deepEqual(publishConcurrencyFindings(otherJobOnlyWorkflow), [
			'job release-please has no job-level concurrency',
		]);
	});
});
