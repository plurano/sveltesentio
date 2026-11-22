// jsdom 31 has no HTMLDialogElement.showModal / .close. Unit tests mount native
// <dialog> elements; without these methods Svelte's open lifecycle cannot run and
// getByRole('dialog') will not see a closed dialog. Real browsers are unaffected.
export function installDialogStub(): void {
	if (typeof HTMLDialogElement.prototype.showModal === 'function') {
		return;
	}

	HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
		this.setAttribute('open', '');
	};

	HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
		this.removeAttribute('open');
		this.dispatchEvent(new Event('close', { bubbles: false }));
	};
}
