// Issue #622: docs/compose/toast.md drifted from @sveltesentio/ui/toast; this
// suite pins the toast.md preset sizing table, @sveltesentio/ui/toast imports
// in every compose recipe, and removed identifiers against the shipped source.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { presets, type InterfaceType } from '../src/presets/index.js';
import { toastPreset } from '../src/toast/index.js';

const START_MARKER = '<!-- toast-preset-table:start -->';
const END_MARKER = '<!-- toast-preset-table:end -->';
const COMPOSE_DIR_URL = new URL('../../../docs/compose/', import.meta.url);
const MAX_COMPOSE_FILES = 1_000;
const MAX_TABLE_ROWS = 64;
const MAX_TABLE_COLS = 32;
const MAX_MATCHES = 64;

const EXPORT_TYPE_BLOCK_RE = /\bexport\s+type\s*\{([^}]*)\}/g;
const EXPORT_BLOCK_RE = /\bexport\s*\{([^}]*)\}/g;
const TOAST_IMPORT_RE =
	/\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@sveltesentio\/ui\/toast['"]/g;

function readComposeDoc(file: string): Promise<string> {
	return readFile(join(fileURLToPath(COMPOSE_DIR_URL), file), {
		encoding: 'utf8',
		signal: AbortSignal.timeout(5_000),
	});
}

async function listComposeDocs(): Promise<string[]> {
	const entries = await readdir(COMPOSE_DIR_URL, { withFileTypes: true });
	if (entries.length > MAX_COMPOSE_FILES) {
		throw new Error(`docs/compose holds more than ${MAX_COMPOSE_FILES} entries`);
	}
	const files = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => entry.name)
		.sort();
	return files;
}

function readToastDoc(): Promise<string> {
	return readComposeDoc('toast.md');
}

function readToastIndexSource(): Promise<string> {
	return readFile(fileURLToPath(new URL('../src/toast/index.ts', import.meta.url)), {
		encoding: 'utf8',
		signal: AbortSignal.timeout(5_000),
	});
}

function findSingleMarker(markdown: string, marker: string, label: string): number {
	const first = markdown.indexOf(marker);
	if (first === -1) {
		throw new Error(`Missing ${label} marker: ${marker}`);
	}
	if (markdown.indexOf(marker, first + marker.length) !== -1) {
		throw new Error(`Duplicate ${label} marker: ${marker}`);
	}
	return first;
}

function parseRowCells(line: string): string[] {
	const inner = line.replace(/^\|/, '').replace(/\|$/, '');
	const rawCells = inner.split('|').slice(0, MAX_TABLE_COLS);
	return rawCells.map((cell) => cell.trim().replace(/^`+|`+$/g, ''));
}

function presetTable(markdown: string): string[][] {
	const start = findSingleMarker(markdown, START_MARKER, 'start');
	const end = findSingleMarker(markdown, END_MARKER, 'end');
	if (end < start + START_MARKER.length) {
		throw new Error('End marker precedes start marker');
	}
	const rawLines = markdown.slice(start + START_MARKER.length, end).split(/\r?\n/);
	const trimmed = rawLines.map((line) => line.trim());
	const tableLines = trimmed.filter((line) => line.length > 0);
	if (tableLines.length <= 2) {
		return [];
	}
	return tableLines.slice(2, 2 + MAX_TABLE_ROWS).map(parseRowCells);
}

function expectedRow(type: InterfaceType): string[] {
	const p = toastPreset(type);
	return [
		type,
		p.position,
		p.width,
		p.offset,
		String(p.toaster.gap),
		p.style['--toast-padding'] ?? '',
		p.style['--font-size'] ?? '',
		p.style['--border-radius'] ?? '',
		p.style['--toast-min-target-size'] ?? '',
	];
}

function sortByFirstCell(rows: readonly (readonly string[])[]): string[][] {
	const copy = rows.map((row) => [...row]);
	return copy.sort((a, b) => {
		const left = a[0] ?? '';
		const right = b[0] ?? '';
		return left < right ? -1 : left > right ? 1 : 0;
	});
}

function lastIdentifier(spec: string): string {
	const parts = spec.trim().split(/\s+as\s+/);
	return parts.at(-1)?.trim() ?? '';
}

function parseIndexTypeExports(source: string): Set<string> {
	const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
	const names = new Set<string>();
	const typeBlocks = Array.from(stripped.matchAll(EXPORT_TYPE_BLOCK_RE));
	for (const match of typeBlocks.slice(0, MAX_MATCHES)) {
		const specs = (match[1] ?? '').split(',').slice(0, MAX_TABLE_COLS);
		for (const spec of specs) {
			const exported = lastIdentifier(spec);
			if (exported.length > 0) names.add(exported);
		}
	}
	const mixedBlocks = Array.from(stripped.matchAll(EXPORT_BLOCK_RE));
	for (const match of mixedBlocks.slice(0, MAX_MATCHES)) {
		const specs = (match[1] ?? '').split(',').slice(0, MAX_TABLE_COLS);
		for (const spec of specs) {
			const trimmed = spec.trim();
			if (!/^type\s+/.test(trimmed)) continue;
			const exported = lastIdentifier(trimmed.replace(/^type\s+/, ''));
			if (exported.length > 0) names.add(exported);
		}
	}
	return names;
}

function findUnknownToastImports(
	markdown: string,
	valueExports: ReadonlySet<string>,
	typeExports: ReadonlySet<string>,
): { count: number; unknown: string[] } {
	const allMatches = Array.from(markdown.matchAll(TOAST_IMPORT_RE));
	const matches = allMatches.slice(0, MAX_MATCHES);
	const unknown: string[] = [];
	for (const match of matches) {
		const typeOnlyClause = Boolean(match[1]);
		const specs = (match[2] ?? '').split(',').slice(0, MAX_TABLE_COLS);
		for (const rawSpec of specs) {
			const trimmed = rawSpec.trim();
			if (trimmed.length === 0) continue;
			const inlineType = /^type\s+/.test(trimmed);
			const withoutType = inlineType ? trimmed.replace(/^type\s+/, '') : trimmed;
			const imported = withoutType.split(/\s+as\s+/)[0]?.trim() ?? '';
			if (typeOnlyClause || inlineType) {
				if (!typeExports.has(imported)) unknown.push(`type ${imported}`);
			} else if (!valueExports.has(imported)) {
				unknown.push(imported);
			}
		}
	}
	return { count: matches.length, unknown };
}

describe('docs/compose/toast.md contract (#622)', () => {
	const interfaceKeys = Object.keys(presets) as InterfaceType[];
	const expected = interfaceKeys.map(expectedRow);

	it('matches toastPreset() across every InterfaceType in documented order', async () => {
		const markdown = await readToastDoc();
		const rows = presetTable(markdown);

		expect(rows.map((row) => row[0])).toEqual(['desktop', 'dashboard', '10foot', 'handheld']);
		expect(rows).toHaveLength(interfaceKeys.length);
		expect(sortByFirstCell(rows)).toEqual(sortByFirstCell(expected));
	});

	it('detects a drifted cell and rejects missing table markers', async () => {
		const markdown = await readToastDoc();
		const drifted = markdown.replace('| `40rem` |', '| `560px` |');
		expect(drifted).not.toBe(markdown);
		expect(sortByFirstCell(presetTable(drifted))).not.toEqual(sortByFirstCell(expected));

		const withoutStart = markdown.replace(START_MARKER, '');
		expect(() => presetTable(withoutStart)).toThrow(/start marker/i);

		const withoutEnd = markdown.replace(END_MARKER, '');
		expect(() => presetTable(withoutEnd)).toThrow(/end marker/i);
	});

	it('rejects duplicate markers and treats adjacent markers as zero rows', async () => {
		const markdown = await readToastDoc();
		expect(() => presetTable(`${START_MARKER}\n${markdown}`)).toThrow(/duplicate start marker/i);
		expect(() => presetTable(`${markdown}\n${END_MARKER}`)).toThrow(/duplicate end marker/i);

		const adjacent = presetTable(`${START_MARKER}\n${END_MARKER}`);
		expect(adjacent).toEqual([]);
		expect(adjacent).not.toEqual(expected);
	});

	it('imports only real value and type exports from @sveltesentio/ui/toast', async () => {
		const [files, indexSource, runtimeModule] = await Promise.all([
			listComposeDocs(),
			readToastIndexSource(),
			import('../src/toast/index.js'),
		]);
		expect(files).toContain('toast.md');
		const valueExports = new Set(Object.keys(runtimeModule));
		const typeExports = parseIndexTypeExports(indexSource);

		for (const file of files.slice(0, MAX_COMPOSE_FILES)) {
			const markdown = await readComposeDoc(file);
			const actual = findUnknownToastImports(markdown, valueExports, typeExports);
			if (file === 'toast.md') {
				expect(actual.count).toBeGreaterThan(0);
			}
			expect(actual.unknown, `docs/compose/${file}`).toEqual([]);
		}

		const syntheticToast = findUnknownToastImports(
			"import { toast } from '@sveltesentio/ui/toast';",
			valueExports,
			typeExports,
		);
		expect(syntheticToast.unknown).toEqual(['toast']);

		const syntheticValue = findUnknownToastImports(
			"import { Toaster } from '@sveltesentio/ui/toast';",
			valueExports,
			typeExports,
		);
		expect(syntheticValue.unknown).toEqual(['Toaster']);

		const syntheticType = findUnknownToastImports(
			"import { type ToastOptions } from '@sveltesentio/ui/toast';",
			valueExports,
			typeExports,
		);
		expect(syntheticType.unknown).toEqual(['type ToastOptions']);
	});

	it('omits removed pre-#622 identifiers from the recipe', async () => {
		const markdown = await readToastDoc();
		for (const removed of ['withPreset', 'data-preset', 'problemToMessage'] as const) {
			expect(markdown).not.toContain(removed);
		}
	});
});
