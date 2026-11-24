// Unit tests for `liftIntoTopLayer` in `src/dialog/dialog.ts`. Runs in the jsdom
// `components` project (`*.svelte.test.ts`) so `HTMLDialogElement`, `HTMLElement`,
// `document.activeElement`, and the `showModal`/`close` shim from `dialog-stub.ts`
// (`setup-component.ts`) are installed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liftIntoTopLayer } from '../src/dialog/dialog.js';

function mountDialog(alreadyOpen = false): {
	dialog: HTMLDialogElement;
	input: HTMLInputElement;
} {
	const dialog = document.createElement('dialog');
	if (alreadyOpen) dialog.setAttribute('open', '');
	const input = document.createElement('input');
	dialog.append(input);
	document.body.append(dialog);
	return { dialog, input };
}

function mountButton(label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = label;
	document.body.append(button);
	return button;
}

/**
 * Mount a closed dialog, lift it with a no-op initial focus, let the focus
 * microtask run, and assert that cleanup does not throw.
 */
async function liftThenCleanUp(): Promise<HTMLDialogElement> {
	const { dialog } = mountDialog();
	const cleanup = liftIntoTopLayer(dialog, vi.fn());
	await Promise.resolve();
	expect(() => cleanup()).not.toThrow();
	return dialog;
}

afterEach(() => {
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('liftIntoTopLayer', () => {
	it('opens a closed dialog, defers initial focus, and restores focus (positive)', async () => {
		const opener = mountButton('Open');
		opener.focus();
		const { dialog, input } = mountDialog();
		const focusInitial = vi.fn(() => {
			input.focus();
		});

		expect(dialog).not.toHaveAttribute('open');
		const cleanup = liftIntoTopLayer(dialog, focusInitial);

		expect(dialog).toHaveAttribute('open');
		expect(focusInitial).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(opener);

		await Promise.resolve();
		expect(focusInitial).toHaveBeenCalledTimes(1);
		expect(document.activeElement).toBe(input);

		cleanup();
		expect(dialog).not.toHaveAttribute('open');
		expect(document.activeElement).toBe(opener);
	});

	it('does not call showModal when the dialog is already open (negative)', async () => {
		const { dialog, input } = mountDialog(true);
		const showModalSpy = vi.spyOn(dialog, 'showModal');

		const cleanup = liftIntoTopLayer(dialog, () => {
			input.focus();
		});
		expect(showModalSpy).not.toHaveBeenCalled();

		await Promise.resolve();
		expect(document.activeElement).toBe(input);

		cleanup();
		expect(dialog).not.toHaveAttribute('open');
	});

	it('cleanup does not throw or move focus when activeElement was body (negative)', async () => {
		const bystander = mountButton('Bystander');
		const bystanderFocus = vi.spyOn(bystander, 'focus');
		expect(document.activeElement).toBe(document.body);

		await liftThenCleanUp();
		expect(bystanderFocus).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(document.body);
	});

	it('ignores non-HTMLElement activeElement on open and cleanup (negative)', async () => {
		vi.spyOn(document, 'activeElement', 'get').mockReturnValueOnce(null);

		const dialog = await liftThenCleanUp();
		expect(dialog).not.toHaveAttribute('open');
	});

	it('neither closes nor refocuses on a second cleanup call (boundary)', async () => {
		const opener = mountButton('Open');
		const later = mountButton('Later');
		opener.focus();
		const { dialog, input } = mountDialog();

		const cleanup = liftIntoTopLayer(dialog, () => {
			input.focus();
		});
		await Promise.resolve();

		const closeSpy = vi.spyOn(dialog, 'close');
		const openerFocus = vi.spyOn(opener, 'focus');

		cleanup();
		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(openerFocus).toHaveBeenCalledTimes(1);

		later.focus();
		cleanup();
		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(openerFocus).toHaveBeenCalledTimes(1);
		expect(document.activeElement).toBe(later);
	});

	it('skips close when the browser already closed the dialog (boundary)', async () => {
		const opener = mountButton('Open');
		opener.focus();
		const { dialog, input } = mountDialog();

		const cleanup = liftIntoTopLayer(dialog, () => {
			input.focus();
		});
		await Promise.resolve();

		dialog.removeAttribute('open');
		const closeSpy = vi.spyOn(dialog, 'close');

		cleanup();
		expect(closeSpy).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(opener);
	});
});
