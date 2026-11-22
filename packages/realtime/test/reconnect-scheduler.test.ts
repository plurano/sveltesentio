import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReconnectScheduler } from '../src/reconnect-scheduler.js';
import { receiverChecked } from './receiver-checked.js';

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('createReconnectScheduler', () => {
	it('calls the default timers without a foreign receiver', async () => {
		const fakeSet = globalThis.setTimeout;
		const fakeClear = globalThis.clearTimeout;
		vi.stubGlobal('setTimeout', receiverChecked(fakeSet));
		vi.stubGlobal('clearTimeout', receiverChecked(fakeClear));

		const scheduler = createReconnectScheduler({
			backoff: { minMs: 100, maxMs: 1000, jitter: 0, base: 2, random: () => 0.5 },
		});
		const run = vi.fn();

		let delay = 0;
		expect(() => {
			delay = scheduler.schedule(run);
		}).not.toThrow();
		await vi.advanceTimersByTimeAsync(delay);
		expect(run).toHaveBeenCalledTimes(1);

		scheduler.schedule(run);
		expect(() => {
			scheduler.clear();
		}).not.toThrow();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('starts at attempt 0, tolerates clear() when idle, and uses attempt 1 on first schedule', () => {
		const scheduler = createReconnectScheduler({
			backoff: { minMs: 100, maxMs: 1000, jitter: 0, base: 2, random: () => 0.5 },
		});

		expect(scheduler.attempt).toBe(0);
		expect(() => {
			scheduler.clear();
		}).not.toThrow();

		const delay = scheduler.schedule(vi.fn());
		expect(delay).toBe(200);
		expect(scheduler.attempt).toBe(1);
	});

	it('reset() returns attempt to 0 and restores the initial backoff delay', () => {
		const scheduler = createReconnectScheduler({
			backoff: { minMs: 100, maxMs: 1000, jitter: 0, base: 2, random: () => 0.5 },
		});
		const noop = vi.fn();

		expect(scheduler.schedule(noop)).toBe(200);
		expect(scheduler.schedule(noop)).toBe(400);
		expect(scheduler.attempt).toBe(2);

		scheduler.reset();
		expect(scheduler.attempt).toBe(0);
		expect(scheduler.schedule(noop)).toBe(200);
		expect(scheduler.attempt).toBe(1);
	});
});
