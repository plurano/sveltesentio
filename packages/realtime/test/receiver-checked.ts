/**
 * Stands in for the browser `setTimeout`/`clearTimeout`, which throw
 * `Illegal invocation` when called with a receiver other than the global or
 * `undefined`; Node does not check, so tests stub the global with this (#424).
 */
export function receiverChecked<T extends (...args: never[]) => unknown>(impl: T): T {
	// Cast preserves overloaded timer signatures (such as Node's setTimeout.__promisify__) as T.
	return function (this: unknown, ...args: never[]): unknown {
		if (this !== undefined && this !== globalThis) {
			throw new TypeError('Illegal invocation');
		}
		return impl(...args);
	} as unknown as T;
}
