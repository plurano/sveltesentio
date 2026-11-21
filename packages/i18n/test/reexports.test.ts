import { describe, expect, it } from 'vitest';
import { paraglideVitePlugin } from '../src/index.js';
import { paraglideVitePlugin as upstreamParaglideVitePlugin } from '@inlang/paraglide-js';

describe('i18n re-exports (append-only API, HISS-14)', () => {
	it('re-exports paraglideVitePlugin identical to upstream @inlang/paraglide-js export', () => {
		expect(paraglideVitePlugin).toBeDefined();
		expect(typeof paraglideVitePlugin).toBe('function');
		expect(paraglideVitePlugin).toBe(upstreamParaglideVitePlugin);
	});

	it('produces a configured Vite plugin instance when invoked', () => {
		const plugin = paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide',
		});
		expect(plugin).toBeDefined();
		// Paraglide v2 returns the unplugin result directly; v3 prepends
		// `paraglide-virtual-messages` before `unplugin-paraglide-js`, and
		// `compiler(...)` may itself be a nested plugin array that Vite flattens.
		const entries: unknown[] = [plugin];
		const names: string[] = [];
		for (const entry of entries.flat(4)) {
			if (typeof entry !== 'object' || entry === null) continue;
			if ('name' in entry && typeof entry.name === 'string') {
				names.push(entry.name);
			}
		}
		expect(names).toContain('unplugin-paraglide-js');
	});

	it('boundary/negative: paraglideVitePlugin does not match arbitrary functions', () => {
		const dummyFn = () => {};
		expect(paraglideVitePlugin).not.toBe(dummyFn);
		expect(paraglideVitePlugin).not.toBeNull();
		expect(paraglideVitePlugin).not.toBeUndefined();
	});
});
