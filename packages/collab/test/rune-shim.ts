import { afterEach, beforeEach } from 'vitest';

/** Handle returned by {@link useRuneShim} for manual mid-test effect cleanup. */
export interface RuneShim {
	/** Runs and clears all `$effect` cleanup callbacks collected in the current test. */
	readonly teardown: () => void;
}

/**
 * Installs a non-reactive `$state` / `$effect` shim on `globalThis` across each
 * Vitest test (`beforeEach` / `afterEach`) so `.svelte.ts` rune stores execute in
 * the `node` environment without Svelte client compilation (ADR-0039).
 *
 * `$state(v)` returns `v` (store getters close over the `let` binding and observe
 * reassignments), while `$effect(fn)` runs `fn` immediately and records its cleanup
 * for `teardown()` and `afterEach`.
 */
export function useRuneShim(): RuneShim {
	const cleanups: Array<() => void> = [];
	const host = globalThis as unknown as {
		$state?: unknown;
		$effect?: unknown;
	};

	const teardown = (): void => {
		const pending = cleanups.splice(0, 256);
		cleanups.length = 0;
		for (let i = 0; i < 256; i += 1) {
			const fn = pending[i];
			if (fn === undefined) break;
			fn();
		}
	};

	beforeEach(() => {
		host.$state = <T>(initial: T): T => initial;
		host.$effect = (fn: () => void | (() => void)): void => {
			const cleanup = fn();
			if (typeof cleanup === 'function') {
				if (cleanups.length >= 256) {
					throw new RangeError('useRuneShim exceeded 256 effect cleanups');
				}
				cleanups.push(cleanup);
			}
		};
	});

	afterEach(() => {
		teardown();
		delete host.$state;
		delete host.$effect;
	});

	return { teardown };
}
