import type { BackoffOptions } from './backoff.js';
import { createReconnectScheduler, type ReconnectScheduler } from './reconnect-scheduler.js';

export interface SseEventLike {
	readonly type: string;
	readonly data: string;
	readonly lastEventId?: string;
}

export type EventSourceLike = {
	addEventListener(type: string, handler: (event: unknown) => void): void;
	removeEventListener(type: string, handler: (event: unknown) => void): void;
	close(): void;
};

export type EventSourceFactory = (
	url: string,
	init?: { withCredentials?: boolean },
) => EventSourceLike;

export type SseClientState = 'idle' | 'connecting' | 'open' | 'closed';

export interface SseClientOptions {
	url: string;
	withCredentials?: boolean;
	backoff?: BackoffOptions;
	eventSourceFactory?: EventSourceFactory;
	setTimeoutImpl?: typeof setTimeout;
	clearTimeoutImpl?: typeof clearTimeout;
	/** Named SSE event types to listen for besides `message`; delivered through onMessage with `type` = event name. */
	events?: readonly string[];
	onOpen?: () => void;
	onMessage?: (event: SseEventLike) => void;
	onError?: (error: unknown, attempt: number) => void;
	onStateChange?: (state: SseClientState) => void;
}

export class SseClient {
	private readonly options: SseClientOptions;
	/** Timers run through `createReconnectScheduler`, which calls them without a receiver (browsers throw `Illegal invocation` for a foreign `this`, #424). */
	private readonly reconnect: ReconnectScheduler;
	private source: EventSourceLike | undefined;
	private state: SseClientState = 'idle';
	private readonly factory: EventSourceFactory;
	private namedHandlers: Array<[string, (event: unknown) => void]> = [];

	constructor(options: SseClientOptions) {
		this.options = options;
		this.reconnect = createReconnectScheduler({
			backoff: options.backoff,
			setTimeoutImpl: options.setTimeoutImpl,
			clearTimeoutImpl: options.clearTimeoutImpl,
		});
		const factory = options.eventSourceFactory ?? defaultFactory;
		if (!factory) {
			throw new Error('SseClient requires an eventSourceFactory (no global EventSource present)');
		}
		this.factory = factory;
	}

	get currentState(): SseClientState {
		return this.state;
	}

	get currentAttempt(): number {
		return this.reconnect.attempt;
	}

	start(): void {
		if (this.state === 'connecting' || this.state === 'open') return;
		this.connect();
	}

	close(): void {
		this.reconnect.clear();
		this.teardownSource();
		this.setState('closed');
	}

	private connect(): void {
		this.setState('connecting');
		const source = this.factory(this.options.url, {
			withCredentials: this.options.withCredentials ?? false,
		});
		this.source = source;
		source.addEventListener('open', this.handleOpen);
		source.addEventListener('message', this.handleMessage);
		source.addEventListener('error', this.handleError);
		this.registerNamedListeners(source);
	}

	private registerNamedListeners(source: EventSourceLike): void {
		if (!this.options.events) return;
		const seen = new Set<string>(['message', 'open', 'error', '']);
		for (const name of this.options.events) {
			if (seen.has(name)) continue;
			seen.add(name);
			const handler = (event: unknown): void => {
				this.deliver(event, name);
			};
			this.namedHandlers.push([name, handler]);
			source.addEventListener(name, handler);
		}
	}

	private handleOpen = (): void => {
		this.reconnect.reset();
		this.setState('open');
		this.options.onOpen?.();
	};

	private handleMessage = (event: unknown): void => {
		this.deliver(event, 'message');
	};

	private deliver(event: unknown, fallbackType: string): void {
		const evt = event as Partial<SseEventLike>;
		const payload: SseEventLike = {
			type: typeof evt.type === 'string' ? evt.type : fallbackType,
			data: typeof evt.data === 'string' ? evt.data : '',
			...(typeof evt.lastEventId === 'string' ? { lastEventId: evt.lastEventId } : {}),
		};
		this.options.onMessage?.(payload);
	}

	/** Stops when `onError` called `close()`, which already tore the source down. */
	private handleError = (error: unknown): void => {
		this.options.onError?.(error, this.reconnect.attempt);
		if (this.state === 'closed') return;
		this.teardownSource();
		this.scheduleReconnect();
	};

	/**
	 * Arms the retry before announcing `connecting`, so a `close()` called from
	 * inside `onStateChange` cancels the pending timer instead of leaving a
	 * closed client to reconnect.
	 */
	private scheduleReconnect(): void {
		this.reconnect.schedule(() => {
			this.connect();
		});
		this.setState('connecting');
	}

	private teardownSource(): void {
		if (!this.source) return;
		this.source.removeEventListener('open', this.handleOpen);
		this.source.removeEventListener('message', this.handleMessage);
		this.source.removeEventListener('error', this.handleError);
		for (const [name, handler] of this.namedHandlers) {
			this.source.removeEventListener(name, handler);
		}
		this.namedHandlers = [];
		this.source.close();
		this.source = undefined;
	}

	private setState(next: SseClientState): void {
		if (this.state === next) return;
		this.state = next;
		this.options.onStateChange?.(next);
	}
}

const defaultFactory: EventSourceFactory | undefined = (() => {
	const es = (globalThis as { EventSource?: unknown }).EventSource;
	if (typeof es !== 'function') return undefined;
	return (url: string, init?: { withCredentials?: boolean }) => {
		const Ctor = es as new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;
		return new Ctor(url, init);
	};
})();
