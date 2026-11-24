// Shared native `<dialog>` lifecycle assertions for `Dialog.svelte` and
// `CommandPalette.svelte`. Both components lift their overlay into the browser
// top layer via `showModal()` and guard against a late queued `close` event from
// a previously unmounted `<dialog>` closing a freshly reopened one, so their
// component suites verify the same DOM invariants through one set of helpers.
import { tick } from 'svelte';
import { expect } from 'vitest';
import { flushQueuedDialogClose } from './dialog-stub.js';

/** Minimal `rerender` contract shared by `<Dialog>` and `<CommandPalette>` tests. */
export type RerenderOpen = (props: { open: boolean }) => Promise<void>;

/**
 * Asserts that `container` holds a mounted native `<dialog>` element carrying
 * the `open` attribute, and returns it.
 */
export function expectNativeOpenDialog(container: HTMLElement): HTMLDialogElement {
	const native = container.querySelector('dialog');
	expect(native).not.toBeNull();
	expect(native?.tagName).toBe('DIALOG');
	expect(native).toHaveAttribute('open');
	if (!native) {
		throw new Error('Expected a native <dialog> element');
	}
	return native;
}

/**
 * Closes a mounted `<dialog>` component and immediately reopens it so a
 * replacement `<dialog>` mounts while the unmounted one's `close` task is queued.
 */
export async function reopenDialog(rerender: RerenderOpen): Promise<void> {
	await rerender({ open: false });
	await rerender({ open: true });
}

/**
 * Closes and reopens a `<dialog>` component, then verifies that the replacement
 * `<dialog>` stays mounted and `open` after the unmounted one fires its queued
 * `close` event.
 */
export async function expectReopenSurvivesQueuedClose(
	rerender: RerenderOpen,
	container: HTMLElement,
): Promise<void> {
	await reopenDialog(rerender);
	const replacement = container.querySelector('dialog');
	expect(replacement).toHaveAttribute('open');
	await flushQueuedDialogClose();
	await tick();
	expect(container.querySelector('dialog')).toBe(replacement);
	expect(replacement).toHaveAttribute('open');
}
