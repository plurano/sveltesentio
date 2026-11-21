/**
 * Soak and boundary tests for in-flight queue and client disconnect handling
 * (gap audit C14-9).
 *
 * Bounds verified here:
 * - Sustained disconnection (peer `close` or socket `error`): `failAll` drains
 *   the pending queue to zero and clears all timers, and every subsequent
 *   request rejects immediately with the recorded `ProblemError` without
 *   writing to the socket or arming a timer.
 * - Stalled peer (socket open, no reply, `requestTimeoutMs` configured): every
 *   pending entry remains queued before its deadline, leaves the queue at its
 *   deadline, and leaves zero active timers behind.
 */
import { describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@sveltesentio/core';
import { createIpcClient, type IpcClient } from '../src/client.js';
import { createPendingQueue, type PendingQueue } from '../src/pending-queue.js';
import type { AccessFn } from '../src/transport.js';
import { FakeSocket } from './fake-socket.js';

const SOAK = 10_000;
const QUEUE_TIMEOUT_MS = 1_000;
const CLIENT_TIMEOUT_MS = 500;
const SOCK = '/run/golusoris/api.sock';

interface QueueEntryRecord {
	resolveCount: number;
	rejectCount: number;
	timeoutCount: number;
	payload: Uint8Array | undefined;
	error: ProblemError | undefined;
}

interface EnqueuedBatch {
	readonly entries: readonly QueueEntryRecord[];
	readonly resolvedOrder: readonly number[];
	readonly totalTimeouts: () => number;
}

interface FulfilledOutcome {
	readonly status: 'fulfilled';
	readonly value: Uint8Array;
}

interface RejectedOutcome {
	readonly status: 'rejected';
	readonly reason: unknown;
}

type RequestOutcome = FulfilledOutcome | RejectedOutcome;

interface TrackedRequests {
	readonly settledCount: () => number;
	readonly results: () => Promise<RequestOutcome[]>;
}

interface ConnectedClient {
	readonly client: IpcClient;
	readonly socket: FakeSocket;
}

/** Encode a request index `< 65_536` into a distinct two-byte payload. */
function indexBytes(index: number): Uint8Array {
	return Uint8Array.from([(index >> 8) & 0xff, index & 0xff]);
}

/** Run a synchronous test callback under Vitest fake timers and restore real timers. */
function withFakeTimersSync(fn: () => void): void {
	vi.useFakeTimers();
	try {
		fn();
	} finally {
		vi.useRealTimers();
	}
}

/** Run an async test callback under Vitest fake timers and restore real timers. */
async function withFakeTimers(fn: () => Promise<void>): Promise<void> {
	vi.useFakeTimers();
	try {
		await fn();
	} finally {
		vi.useRealTimers();
	}
}

/** Build a sample 502 {@link ProblemError} for direct `failAll` queue tests. */
function queueFailure(): ProblemError {
	return new ProblemError({
		type: 'https://sveltesentio.dev/problems/ipc-request',
		title: 'IPC request failed',
		status: 502,
		detail: 'Socket closed by peer',
	});
}

/**
 * Register `SOAK` entries on `queue` with `timeoutMs`, recording per-entry
 * settlement counts, values, and resolution order.
 */
function enqueueSoakEntries(queue: PendingQueue, timeoutMs: number): EnqueuedBatch {
	const entries: QueueEntryRecord[] = [];
	const resolvedOrder: number[] = [];
	let timeouts = 0;
	for (let i = 0; i < SOAK; i += 1) {
		const record: QueueEntryRecord = {
			resolveCount: 0,
			rejectCount: 0,
			timeoutCount: 0,
			payload: undefined,
			error: undefined,
		};
		entries.push(record);
		queue.add(
			{
				resolve: (payload: Uint8Array): void => {
					record.resolveCount += 1;
					record.payload = payload;
					resolvedOrder.push(i);
				},
				reject: (error: ProblemError): void => {
					record.rejectCount += 1;
					record.error = error;
				},
			},
			timeoutMs,
			(): void => {
				record.timeoutCount += 1;
				timeouts += 1;
			},
		);
	}
	return {
		entries,
		resolvedOrder,
		totalTimeouts: (): number => timeouts,
	};
}

/** Settle `count` entries on `queue` with sequential index payloads. */
function settleCount(queue: PendingQueue, count: number): void {
	for (let i = 0; i < SOAK; i += 1) {
		if (i >= count) break;
		queue.settleNext(indexBytes(i));
	}
}

/** Check whether `actual` equals the two-byte payload encoded for `index`. */
function matchesIndexPayload(actual: Uint8Array | undefined, index: number): boolean {
	if (actual === undefined || actual.byteLength !== 2) return false;
	return actual[0] === ((index >> 8) & 0xff) && actual[1] === (index & 0xff);
}

/** Check whether `entry` resolved once with `index`'s payload and never failed or timed out. */
function isCleanlyResolved(entry: QueueEntryRecord | undefined, index: number): boolean {
	if (entry === undefined || entry.resolveCount !== 1) return false;
	if (entry.timeoutCount !== 0 || entry.rejectCount !== 0) return false;
	return matchesIndexPayload(entry.payload, index);
}

/** Assert the first `count` entries resolved in FIFO order without timing out. */
function assertPrefixResolvedInOrder(batch: EnqueuedBatch, count: number): void {
	expect(batch.resolvedOrder).toHaveLength(count);
	const mismatches: number[] = [];
	for (let i = 0; i < SOAK; i += 1) {
		if (i >= count) break;
		if (batch.resolvedOrder[i] !== i || !isCleanlyResolved(batch.entries[i], i)) {
			mismatches.push(i);
		}
	}
	expect(mismatches).toEqual([]);
}

/** Check whether `entry` timed out once and neither resolved nor rejected. */
function isTimedOutOnce(entry: QueueEntryRecord | undefined): boolean {
	if (entry === undefined || entry.timeoutCount !== 1) return false;
	return entry.resolveCount === 0 && entry.rejectCount === 0;
}

/** Assert every entry in `[start, end)` timed out once without resolving or rejecting. */
function assertRangeTimedOutOnce(
	entries: readonly QueueEntryRecord[],
	start: number,
	end: number,
): void {
	const mismatches: number[] = [];
	for (let i = 0; i < SOAK; i += 1) {
		if (i < start) continue;
		if (i >= end) break;
		if (!isTimedOutOnce(entries[i])) mismatches.push(i);
	}
	expect(mismatches).toEqual([]);
}

/** Check whether `entry` rejected once with `expectedError` and never resolved or timed out. */
function isRejectedOnceWith(
	entry: QueueEntryRecord | undefined,
	expectedError: ProblemError,
): boolean {
	if (entry === undefined || entry.rejectCount !== 1 || entry.error !== expectedError) {
		return false;
	}
	return entry.resolveCount === 0 && entry.timeoutCount === 0;
}

/** Assert every entry rejected once with the exact `expectedError` instance. */
function assertAllQueueEntriesFailedWith(
	entries: readonly QueueEntryRecord[],
	expectedError: ProblemError,
): void {
	expect(entries).toHaveLength(SOAK);
	const mismatches: number[] = [];
	for (let i = 0; i < SOAK; i += 1) {
		if (!isRejectedOnceWith(entries[i], expectedError)) mismatches.push(i);
	}
	expect(mismatches).toEqual([]);
}

/** Open a client wired to a {@link FakeSocket} with a 500ms per-request timeout. */
async function openSoakClient(): Promise<ConnectedClient> {
	const socket = new FakeSocket();
	const access: AccessFn = (path: string): Promise<void> => {
		if (path !== SOCK) return Promise.reject(new Error(`ENOENT: ${path}`));
		return Promise.resolve();
	};
	const client = await createIpcClient({
		socketPath: SOCK,
		access,
		connect: () => socket,
		requestTimeoutMs: CLIENT_TIMEOUT_MS,
	});
	return { client, socket };
}

/**
 * Dispatch `count` requests (`count <= SOAK`) and attach handlers immediately
 * so rejections are collected without ever becoming unhandled.
 */
function startRequests(client: IpcClient, count: number): TrackedRequests {
	let settled = 0;
	const tracked: Promise<RequestOutcome>[] = [];
	for (let i = 0; i < SOAK; i += 1) {
		if (i >= count) break;
		tracked.push(
			client.request(indexBytes(i)).then(
				(value: Uint8Array): RequestOutcome => {
					settled += 1;
					return { status: 'fulfilled', value };
				},
				(reason: unknown): RequestOutcome => {
					settled += 1;
					return { status: 'rejected', reason };
				},
			),
		);
	}
	return {
		settledCount: (): number => settled,
		results: (): Promise<RequestOutcome[]> => Promise.all(tracked),
	};
}

/** Extract the first rejection as a {@link ProblemError} with `status` and `detail`. */
function expectFirstProblemRejection(
	outcomes: readonly RequestOutcome[],
	status: number,
	detail: string,
): ProblemError {
	const first = outcomes[0];
	expect(first?.status).toBe('rejected');
	const reason = first?.status === 'rejected' ? first.reason : undefined;
	expect(reason).toBeInstanceOf(ProblemError);
	if (!(reason instanceof ProblemError)) {
		throw new ProblemError({
			type: 'https://sveltesentio.dev/problems/test-assertion',
			title: 'Expected ProblemError rejection',
			status: 500,
		});
	}
	expect(reason.status).toBe(status);
	expect(reason.detail).toBe(detail);
	return reason;
}

/** Assert all `expectedCount` outcomes rejected with the exact `expectedError` reference. */
function assertAllSameRejection(
	outcomes: readonly RequestOutcome[],
	expectedCount: number,
	expectedError: ProblemError,
): void {
	expect(outcomes).toHaveLength(expectedCount);
	const first = outcomes[0];
	const firstReason = first?.status === 'rejected' ? first.reason : undefined;
	expect(firstReason).toBe(expectedError);
	const mismatches: number[] = [];
	for (let i = 0; i < SOAK; i += 1) {
		if (i >= expectedCount) break;
		const outcome = outcomes[i];
		if (outcome?.status !== 'rejected' || outcome.reason !== expectedError) {
			mismatches.push(i);
		}
	}
	expect(mismatches).toEqual([]);
}

/** Check whether `outcome` rejected with a {@link ProblemError} matching `status` and `detail`. */
function isProblemRejection(
	outcome: RequestOutcome | undefined,
	status: number,
	detail: string,
): boolean {
	if (outcome === undefined || outcome.status !== 'rejected') return false;
	if (!(outcome.reason instanceof ProblemError)) return false;
	return outcome.reason.status === status && outcome.reason.detail === detail;
}

/** Assert all `SOAK` outcomes rejected with a {@link ProblemError} of `status` and `detail`. */
function assertAllProblemRejections(
	outcomes: readonly RequestOutcome[],
	status: number,
	detail: string,
): void {
	expect(outcomes).toHaveLength(SOAK);
	const mismatches: number[] = [];
	for (let i = 0; i < SOAK; i += 1) {
		if (!isProblemRejection(outcomes[i], status, detail)) mismatches.push(i);
	}
	expect(mismatches).toEqual([]);
}

/**
 * Verify that 1,000 in-flight requests drain with a 502 {@link ProblemError}
 * when `disconnect` fires, and `SOAK` subsequent requests reject with the
 * identical error object without writing frames or arming timers.
 */
async function verifySustainedDisconnect(
	disconnect: (socket: FakeSocket) => void,
	expectedDetail: string,
): Promise<void> {
	const preDropCount = 1_000;
	const { client, socket } = await openSoakClient();
	const inFlight = startRequests(client, preDropCount);
	expect(socket.written).toHaveLength(preDropCount);
	expect(vi.getTimerCount()).toBe(preDropCount);

	disconnect(socket);
	expect(vi.getTimerCount()).toBe(0);

	const inFlightOutcomes = await inFlight.results();
	const recordedFailure = expectFirstProblemRejection(inFlightOutcomes, 502, expectedDetail);
	assertAllSameRejection(inFlightOutcomes, preDropCount, recordedFailure);

	const outage = startRequests(client, SOAK);
	expect(socket.written).toHaveLength(preDropCount);
	expect(vi.getTimerCount()).toBe(0);

	const outageOutcomes = await outage.results();
	assertAllSameRejection(outageOutcomes, SOAK, recordedFailure);

	vi.advanceTimersByTime(CLIENT_TIMEOUT_MS * 2);
	expect(socket.written).toHaveLength(preDropCount);
	expect(vi.getTimerCount()).toBe(0);
}

describe('createPendingQueue soak — timeout and failAll bounds', () => {
	it('holds SOAK entries at 999ms and drains each once at 1000ms (boundary)', () => {
		withFakeTimersSync(() => {
			const queue = createPendingQueue();
			const batch = enqueueSoakEntries(queue, QUEUE_TIMEOUT_MS);
			expect(queue.size).toBe(SOAK);
			expect(vi.getTimerCount()).toBe(SOAK);

			vi.advanceTimersByTime(QUEUE_TIMEOUT_MS - 1);
			expect(batch.totalTimeouts()).toBe(0);
			expect(queue.size).toBe(SOAK);
			expect(vi.getTimerCount()).toBe(SOAK);

			vi.advanceTimersByTime(1);
			expect(batch.totalTimeouts()).toBe(SOAK);
			expect(queue.size).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
			assertRangeTimedOutOnce(batch.entries, 0, SOAK);
		});
	});

	it('rejects SOAK entries once on failAll and clears all timers (negative)', () => {
		withFakeTimersSync(() => {
			const queue = createPendingQueue();
			const batch = enqueueSoakEntries(queue, QUEUE_TIMEOUT_MS);
			const err = queueFailure();

			queue.failAll(err);
			expect(queue.failure).toBe(err);
			expect(queue.size).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
			assertAllQueueEntriesFailedWith(batch.entries, err);

			vi.advanceTimersByTime(QUEUE_TIMEOUT_MS * 2);
			expect(batch.totalTimeouts()).toBe(0);
			expect(queue.size).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	it('settles the first half in order and times out only the rest (positive)', () => {
		withFakeTimersSync(() => {
			const queue = createPendingQueue();
			const half = SOAK / 2;
			const batch = enqueueSoakEntries(queue, QUEUE_TIMEOUT_MS);

			settleCount(queue, half);
			assertPrefixResolvedInOrder(batch, half);
			expect(queue.size).toBe(half);
			expect(vi.getTimerCount()).toBe(half);
			expect(batch.totalTimeouts()).toBe(0);

			vi.advanceTimersByTime(QUEUE_TIMEOUT_MS);
			expect(batch.totalTimeouts()).toBe(half);
			expect(queue.size).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
			assertPrefixResolvedInOrder(batch, half);
			assertRangeTimedOutOnce(batch.entries, half, SOAK);
		});
	});
});

describe('createIpcClient soak — disconnect and stalled peer bounds', () => {
	it('drains on peer close and fails outage calls with same 502 (positive)', async () => {
		await withFakeTimers(async () => {
			const drop = (socket: FakeSocket): void => {
				socket.emit('close');
			};
			await verifySustainedDisconnect(drop, 'Socket closed by peer');
		});
	});

	it('drains on socket error and fails outage calls with same 502 (positive)', async () => {
		await withFakeTimers(async () => {
			const drop = (socket: FakeSocket): void => {
				socket.emit('error', new Error('ECONNRESET'));
			};
			await verifySustainedDisconnect(drop, 'Socket transport error');
		});
	});

	it('keeps stalled calls pending at 499ms and 504s all at 500ms (boundary)', async () => {
		await withFakeTimers(async () => {
			const { client, socket } = await openSoakClient();
			const batch = startRequests(client, SOAK);
			expect(socket.written).toHaveLength(SOAK);
			expect(vi.getTimerCount()).toBe(SOAK);

			vi.advanceTimersByTime(CLIENT_TIMEOUT_MS - 1);
			await Promise.resolve();
			expect(batch.settledCount()).toBe(0);
			expect(vi.getTimerCount()).toBe(SOAK);

			vi.advanceTimersByTime(1);
			expect(vi.getTimerCount()).toBe(0);
			const outcomes = await batch.results();
			expect(batch.settledCount()).toBe(SOAK);
			const timeoutDetail = `Request timed out after ${CLIENT_TIMEOUT_MS}ms`;
			assertAllProblemRejections(outcomes, 504, timeoutDetail);
		});
	});

	it('rejects calls after close() with 409 without writes or timers (negative)', async () => {
		await withFakeTimers(async () => {
			const { client, socket } = await openSoakClient();
			client.close();
			expect(socket.ended).toBe(true);

			const batch = startRequests(client, SOAK);
			expect(socket.written).toHaveLength(0);
			expect(vi.getTimerCount()).toBe(0);

			const outcomes = await batch.results();
			assertAllProblemRejections(outcomes, 409, 'Client is closed');
			expect(socket.written).toHaveLength(0);
			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
