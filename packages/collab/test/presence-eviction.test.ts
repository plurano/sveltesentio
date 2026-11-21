/**
 * Stale-peer eviction suite for `createPresenceStore` (gap audit C14-7).
 *
 * `createPresenceStore` owns no timer of its own; stale remote peers are evicted
 * when `y-protocols/awareness` runs its `outdatedTimeout` (30_000 ms) interval
 * check every 3_000 ms and emits `'change'` with origin `'timeout'`.
 *
 * Clock trap: `lib0/time` captures the global clock reference when first loaded.
 * Installing Vitest fake timers inside `beforeEach` or `it` (after static imports
 * evaluate `y-protocols` -> `lib0/time`) leaves `Awareness` reading the real wall
 * clock so stale peers never time out under `vi.advanceTimersByTime`. Installing
 * fake timers once inside `vi.hoisted(...)` runs before module imports, binding
 * `lib0/time` to the fake clock for the life of this isolated test file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	vi.useFakeTimers({ toNotFake: ['setImmediate', 'clearImmediate'] });
});

import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	outdatedTimeout,
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { AwarenessChange, PresenceState } from '../src/awareness.js';
import { createPresenceStore } from '../src/presence-store.svelte.js';
import { useRuneShim } from './rune-shim.js';

interface TrackedPeer {
	readonly awareness: Awareness;
	readonly doc: Y.Doc;
}

/** Directional awareness link handle returned by {@link link}. */
interface PeerLink {
	/** Stops forwarding updates without sending a removal message (silent drop). */
	readonly cut: () => void;
	/** Resumes forwarding subsequent `'update'` emissions across the link. */
	readonly restore: () => void;
}

useRuneShim();

const trackedPeers: TrackedPeer[] = [];

afterEach(() => {
	const pending = trackedPeers.splice(0, 64);
	trackedPeers.length = 0;
	for (let i = 0; i < 64; i += 1) {
		const entry = pending[i];
		if (entry === undefined) break;
		entry.awareness.destroy();
		entry.doc.destroy();
	}
});

/**
 * Builds a real `y-protocols` `Awareness` on a fresh `Y.Doc` and registers both
 * for `afterEach` destruction so the 3_000 ms check interval never leaks.
 */
function peer(): Awareness {
	if (trackedPeers.length >= 64) {
		throw new RangeError('presence-eviction exceeded 64 peers in one test');
	}
	const doc = new Y.Doc();
	const awareness = new Awareness(doc);
	trackedPeers.push({ awareness, doc });
	return awareness;
}

/**
 * Wires `from`'s `'update'` events to `to` via `encodeAwarenessUpdate` /
 * `applyAwarenessUpdate` while the link is up, ignoring `'relay'` echoes.
 */
function link(from: Awareness, to: Awareness): PeerLink {
	let up = true;
	const onUpdate = (change: AwarenessChange, origin: unknown): void => {
		if (!up || origin === 'relay') return;
		const ids = [...change.added, ...change.updated, ...change.removed];
		applyAwarenessUpdate(to, encodeAwarenessUpdate(from, ids), 'relay');
	};
	from.on('update', onUpdate);
	return {
		cut: (): void => {
			up = false;
		},
		restore: (): void => {
			up = true;
		},
	};
}

describe('createPresenceStore eviction — silent timeout', () => {
	it('positive: evicts a silent peer at 30_000 ms, not at 29_999 ms (boundary)', () => {
		expect(outdatedTimeout).toBe(30_000);
		const a = peer();
		const b = peer();
		const store = createPresenceStore<PresenceState>(a);
		const bToA = link(b, a);
		const aToB = link(a, b);
		const timeoutRemovals: number[][] = [];
		a.on('change', ({ removed }: AwarenessChange, origin: unknown): void => {
			if (origin === 'timeout') timeoutRemovals.push([...removed]);
		});

		b.setLocalState({ name: 'b' });
		expect(store.others).toEqual([{ clientId: b.clientID, state: { name: 'b' } }]);
		expect(store.count).toBe(1);

		bToA.cut();
		aToB.cut();

		vi.advanceTimersByTime(29_999);
		expect(store.others).toEqual([{ clientId: b.clientID, state: { name: 'b' } }]);
		expect(store.count).toBe(1);
		expect(timeoutRemovals).toEqual([]);

		vi.advanceTimersByTime(1);
		expect(store.others).toEqual([]);
		expect(store.count).toBe(0);
		expect(timeoutRemovals).toEqual([[b.clientID]]);
	});
});

describe('createPresenceStore eviction — live renewals', () => {
	it('negative: keeps a live peer in others across 90_000 ms of renewals', () => {
		const a = peer();
		const b = peer();
		const store = createPresenceStore<PresenceState>(a);
		link(b, a);
		link(a, b);

		b.setLocalState({ name: 'b' });
		expect(store.others).toEqual([{ clientId: b.clientID, state: { name: 'b' } }]);

		for (let step = 0; step < 30; step += 1) {
			vi.advanceTimersByTime(3_000);
			expect(store.others).toEqual([{ clientId: b.clientID, state: { name: 'b' } }]);
			expect(store.count).toBe(1);
		}
	});
});

describe('createPresenceStore eviction — local client retention', () => {
	it('negative: never evicts the local client after 90_000 ms with links cut', () => {
		const a = peer();
		const b = peer();
		const store = createPresenceStore<PresenceState>(a);
		const inclusive = createPresenceStore<PresenceState>(a, { excludeLocal: false });
		const bToA = link(b, a);
		const aToB = link(a, b);

		store.setLocal({ name: 'a' });
		b.setLocalState({ name: 'b' });
		expect(inclusive.count).toBe(2);

		bToA.cut();
		aToB.cut();
		vi.advanceTimersByTime(90_000);

		expect(store.local).toEqual({ name: 'a' });
		expect(store.clientId).toBe(a.clientID);
		expect(store.others).toEqual([]);
		expect(inclusive.local).toEqual({ name: 'a' });
		expect(inclusive.others).toEqual([{ clientId: a.clientID, state: { name: 'a' } }]);
		expect(inclusive.count).toBe(1);
	});
});

describe('createPresenceStore eviction — selectivity', () => {
	it('positive: evicts only the silent peer after 30_000 ms while a live peer stays', () => {
		const a = peer();
		const b = peer();
		const c = peer();
		const store = createPresenceStore<PresenceState>(a);
		const bToA = link(b, a);
		const aToB = link(a, b);
		link(c, a);
		link(a, c);

		b.setLocalState({ name: 'b' });
		c.setLocalState({ name: 'c' });
		expect(store.count).toBe(2);

		bToA.cut();
		aToB.cut();

		vi.advanceTimersByTime(outdatedTimeout);
		expect(store.others).toEqual([{ clientId: c.clientID, state: { name: 'c' } }]);
		expect(store.count).toBe(1);
	});
});

describe('createPresenceStore eviction — recovery after eviction', () => {
	it('positive: restores an evicted peer when a new state crosses the link', () => {
		const a = peer();
		const b = peer();
		const store = createPresenceStore<PresenceState>(a);
		const bToA = link(b, a);
		const aToB = link(a, b);

		b.setLocalState({ name: 'b' });
		expect(store.count).toBe(1);

		bToA.cut();
		aToB.cut();
		vi.advanceTimersByTime(outdatedTimeout);
		expect(store.others).toEqual([]);

		bToA.restore();
		aToB.restore();
		b.setLocalState({ name: 'b2' });

		expect(store.others).toEqual([{ clientId: b.clientID, state: { name: 'b2' } }]);
		expect(store.count).toBe(1);
	});

	it('boundary: keeps a restored peer absent until its 15_000 ms renewal crosses', () => {
		const a = peer();
		const b = peer();
		const store = createPresenceStore<PresenceState>(a);
		const bToA = link(b, a);
		const aToB = link(a, b);

		b.setLocalState({ name: 'b' });
		expect(store.count).toBe(1);

		bToA.cut();
		aToB.cut();
		vi.advanceTimersByTime(outdatedTimeout);
		expect(store.others).toEqual([]);

		bToA.restore();
		aToB.restore();
		expect(store.others).toEqual([]);

		vi.advanceTimersByTime(outdatedTimeout / 2 - 1);
		expect(store.others).toEqual([]);
		expect(store.count).toBe(0);

		vi.advanceTimersByTime(1);
		expect(store.others).toEqual([{ clientId: b.clientID, state: { name: 'b' } }]);
		expect(store.count).toBe(1);
	});
});
