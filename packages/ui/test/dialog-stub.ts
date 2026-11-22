// jsdom 31 has no HTMLDialogElement.showModal / .close. Unit tests mount native
// <dialog> elements; without these methods Svelte's open lifecycle cannot run and
// getByRole('dialog') will not see a closed dialog. Real browsers are unaffected.
//
// Browsers fire `close` as a queued element task, not inside `close()`. The stub
// queues it with `setTimeout(0)` so a close from an unmounted dialog can arrive
// after a replacement dialog mounted, as it does in a browser.
export function installDialogStub(): void {
	if (typeof HTMLDialogElement.prototype.showModal === 'function') {
		return;
	}

	HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
		this.setAttribute('open', '');
	};

	HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
		this.removeAttribute('open');
		setTimeout(() => {
			this.dispatchEvent(new Event('close', { bubbles: false }));
		}, 0);
	};
}

/**
 * Resolves after every `close` event the stub queued before the call has been
 * dispatched: timer tasks with the same delay run in the order they were queued.
 */
export function flushQueuedDialogClose(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}
