<!--
@component
Dialog — peer-free modal dialog matching the shadcn-svelte Dialog surface
(ADR-0014). The shadcn primitive (backed by `bits-ui`) is CLI-delivered for apps
that want its full composition API; this default covers the common case with no
optional peer. The focus-trap + class logic is the pure, unit-tested `./dialog.ts`.

Rendered in the native `<dialog>` top layer via `showModal()`, above sticky /
fixed content and outside transformed ancestors.

A11y (WAI-ARIA dialog pattern):
- Native `<dialog>` + `aria-modal="true"`; labelled by `aria-labelledby` (the title)
  and described by `aria-describedby` (the description) when those snippets render.
- Escape closes; clicking the overlay closes (dismissible by default).
- Focus moves into the panel on open and is trapped (Tab / Shift+Tab wrap); on
  close, focus returns to the element that was focused before opening.
- `open` is bindable so callers drive it from `$state`.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import TopLayerDialog from './TopLayerDialog.svelte';
	import {
		dialogContentClass,
		focusableElements,
		liftIntoTopLayer,
		nextTrapTarget,
	} from './dialog.js';

	interface Props {
		/** Whether the dialog is open (bindable). */
		open?: boolean;
		/** Accessible title — rendered + wired via `aria-labelledby`. */
		title: string;
		/** Optional description — wired via `aria-describedby`. */
		description?: string;
		/** Allow Escape / overlay click to dismiss. Default `true`. */
		dismissible?: boolean;
		/** Stable id base for ARIA wiring. */
		idBase?: string;
		/** Extra classes appended to the content panel. */
		class?: string;
		/** Dialog body. */
		children?: Snippet;
		/** Optional footer (action buttons). */
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		title,
		description,
		dismissible = true,
		idBase = 'ssentio-dialog',
		class: className,
		children,
		footer,
	}: Props = $props();

	const titleId = $derived(`${idBase}-title`);
	const descId = $derived(`${idBase}-desc`);
	const contentClass = $derived(dialogContentClass(className));

	let modalDialog = $state<HTMLDialogElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);

	function close(): void {
		if (dismissible) open = false;
	}

	function onDialogCancel(event: Event): void {
		event.preventDefault();
		if (dismissible) open = false;
	}

	// Browsers fire `close` as a queued task, so a dialog unmounted by a quick
	// close + reopen still fires it after the new one mounted; only the mounted
	// node may close the dialog.
	function onDialogClose(event: Event): void {
		if (event.currentTarget === modalDialog) open = false;
	}

	function onPanelKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		if (event.key !== 'Tab' || !panel) return;
		const target = nextTrapTarget(focusableElements(panel), document.activeElement, event.shiftKey);
		event.preventDefault();
		(target ?? panel).focus();
	}

	// Focus the first focusable inside the panel (else the panel itself); guard in
	// case the panel unmounted before the microtask runs.
	$effect(() => {
		const node = modalDialog;
		if (!open || !node) return;
		return liftIntoTopLayer(node, () => {
			if (!panel) return;
			const [firstFocusable] = focusableElements(panel);
			(firstFocusable ?? panel).focus();
		});
	});
</script>

{#if open}
	<TopLayerDialog
		bind:node={modalDialog}
		class="ssentio-dialog__shell"
		aria-modal="true"
		aria-labelledby={titleId}
		aria-describedby={description ? descId : undefined}
		oncancel={onDialogCancel}
		onclose={onDialogClose}
		onkeydown={onPanelKeydown}
	>
		<!-- Overlay: a real <button> so it is keyboard-operable + announced; clicking
		     dismisses. The panel sits above it and is the focus scope. -->
		<button
			type="button"
			class="fixed inset-0 z-50 cursor-default border-0 bg-black/80 p-0"
			aria-label="Close dialog"
			tabindex="-1"
			onclick={close}
		></button>
		<div bind:this={panel} class={contentClass} tabindex="-1">
			<header class="flex flex-col gap-1.5 text-center sm:text-left">
				<h2 id={titleId} class="text-lg font-semibold leading-none tracking-tight">{title}</h2>
				{#if description}
					<p id={descId} class="text-sm text-muted-foreground">{description}</p>
				{/if}
			</header>

			{#if children}
				<div class="text-sm">{@render children()}</div>
			{/if}

			{#if footer}
				<footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</TopLayerDialog>
{/if}
