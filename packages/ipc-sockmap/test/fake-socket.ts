import type { SocketLike } from '../src/client.js';

type Handler = (...args: never[]) => void;

/**
 * Test double for `node:net.Socket` driven through {@link SocketLike}.
 *
 * Emits `connect` on a microtask once a listener attaches so client handshake
 * completes without a real socket or timer.
 */
export class FakeSocket implements SocketLike {
	readonly written: Uint8Array[] = [];
	ended = false;
	destroyed = false;
	autoConnect = true;
	private readonly handlers = new Map<string, Set<Handler>>();

	on(event: 'connect', handler: () => void): this;
	on(event: 'data', handler: (chunk: Uint8Array) => void): this;
	on(event: 'error', handler: (error: Error) => void): this;
	on(event: 'close', handler: () => void): this;
	on(event: string, handler: Handler): this {
		let listeners = this.handlers.get(event);
		if (listeners === undefined) {
			listeners = new Set();
			this.handlers.set(event, listeners);
		}
		listeners.add(handler);
		if (event === 'connect' && this.autoConnect) {
			this.autoConnect = false;
			queueMicrotask(() => this.emit('connect'));
		}
		return this;
	}

	write(data: Uint8Array): boolean {
		this.written.push(data);
		return true;
	}

	end(): void {
		this.ended = true;
	}

	destroy(): void {
		this.destroyed = true;
	}

	emit(event: string, ...args: unknown[]): void {
		for (const handler of this.handlers.get(event) ?? []) {
			(handler as (...a: unknown[]) => void)(...args);
		}
	}
}
