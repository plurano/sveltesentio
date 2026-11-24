<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Dialog from './Dialog.svelte';
	import Button from '../button/Button.svelte';
	import { assertCentreHit, waitForElement } from '../../test/top-layer-probe.js';

	// story-covers: TopLayerDialog — the shared top-layer <dialog> shell that Dialog renders through (every story below opens it)

	async function waitForPanelActive(canvasElement: HTMLElement): Promise<HTMLDialogElement> {
		for (let i = 0; i < 50; i += 1) {
			const modal = canvasElement.querySelector<HTMLDialogElement>('dialog');
			const active = document.activeElement;
			if (modal?.contains(active)) return modal;
			await new Promise((r) => setTimeout(r, 20));
		}
		throw new Error('Expected document.activeElement to be inside the dialog panel after open');
	}

	async function waitForPanelRemoval(canvasElement: HTMLElement): Promise<void> {
		for (let i = 0; i < 50; i += 1) {
			if (!canvasElement.querySelector('dialog')) return;
			await new Promise((r) => setTimeout(r, 20));
		}
		throw new Error('Expected dialog panel to be removed from canvas on Escape');
	}

	const { Story } = defineMeta({
		title: 'ui/dialog/Dialog',
		component: Dialog,
		tags: ['autodocs'],
		argTypes: {
			open: { control: 'boolean' },
			title: { control: 'text' },
			description: { control: 'text' },
			dismissible: { control: 'boolean' },
		},
		args: {
			open: true,
			title: 'Confirm deletion',
			description: 'This action cannot be undone. This will permanently remove your project.',
		},
	});
</script>

<script lang="ts">
	let open = $state(true);
</script>

<!-- Open modal dialog with title, description, body content, and close buttons. -->
<Story name="Open" asChild>
	<Dialog
		open={true}
		title="Confirm deletion"
		description="This action cannot be undone. This will permanently remove your project."
	>
		<p class="py-2 text-sm text-muted-foreground">
			All associated deployment targets and databases will be decommissioned.
		</p>
		{#snippet footer()}
			<Button variant="outline">Cancel</Button>
			<Button variant="destructive">Delete project</Button>
		{/snippet}
	</Dialog>
</Story>

<!-- Modal dialog without description (aria-describedby is cleanly omitted). -->
<Story name="Without description" asChild>
	<Dialog open={true} title="Action completed">
		<p class="py-2 text-sm">Your changes have been saved to the remote repository.</p>
		{#snippet footer()}
			<Button variant="default">Close</Button>
		{/snippet}
	</Dialog>
</Story>

<!-- Interactive keyboard focus trap and Escape dismissal test. -->
<Story
	name="Keyboard"
	asChild
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const modal = await waitForPanelActive(canvasElement);
		// The focus trap covers the content panel, not the overlay button beside it.
		const panel = modal.querySelector<HTMLElement>('div[tabindex="-1"]');
		if (!panel) throw new Error('Expected dialog content panel');

		const buttons = panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
		const firstButton = buttons[0];
		const lastButton = buttons[buttons.length - 1];
		if (!firstButton || !lastButton) {
			throw new Error('Focusable buttons not found in panel');
		}

		lastButton.focus();
		lastButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

		if (document.activeElement !== firstButton) {
			throw new Error('Expected activeElement to wrap to the first focusable element in the panel');
		}

		firstButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await waitForPanelRemoval(canvasElement);
	}}
>
	<Dialog
		bind:open
		title="Keyboard navigation"
		description="Verify focus-trap wrapping and Escape key dismissal."
	>
		<p class="py-2 text-sm text-muted-foreground">Focus trap testing content.</p>
		{#snippet footer()}
			<Button variant="outline">Cancel</Button>
			<Button variant="destructive">Confirm</Button>
		{/snippet}
	</Dialog>
</Story>

<!-- Sticky/fixed/transformed page content must not cover the top-layer dialog. -->
<Story
	name="Over page content"
	asChild
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const title = await waitForElement(canvasElement, '#overlay-dialog-title');
		const contentPanel = title.closest<HTMLElement>('[tabindex="-1"]');
		if (!contentPanel) throw new Error('Expected dialog content panel around the title');
		assertCentreHit(contentPanel, 'Panel centre');

		const footerButtons = contentPanel.querySelectorAll<HTMLButtonElement>(
			'footer button:not([disabled])',
		);
		if (footerButtons.length !== 2) {
			throw new Error(`Expected exactly 2 footer buttons, got ${footerButtons.length}`);
		}
		for (let i = 0; i < 2; i += 1) {
			const btn = footerButtons[i];
			if (!btn) throw new Error(`Footer button ${i} missing`);
			assertCentreHit(btn, `Footer button ${i}`);
		}

		if (document.activeElement !== footerButtons[0]) {
			throw new Error('Expected focus on the first footer button after open');
		}
	}}
>
	<main style="background: Canvas; color: CanvasText; min-block-size: 120vh; padding: 1rem;">
		<h1 style="font-size: 1.25rem; font-weight: 600; margin-block-end: 0.75rem;">Workspace</h1>
		<div
			style="transform: translateZ(0); overflow: hidden; block-size: 120px; inline-size: 240px; border: 1px solid CanvasText;"
		>
			<Dialog
				open={true}
				idBase="overlay-dialog"
				title="Confirm action"
				description="Save changes to the server."
			>
				<p style="font-size: 0.875rem;">Review your edits before continuing.</p>
				{#snippet footer()}
					<Button variant="outline">Cancel</Button>
					<Button variant="default">Save</Button>
				{/snippet}
			</Dialog>
		</div>
		<header
			style="position: sticky; inset-block-start: 0; z-index: 2147483000; background: rgb(15 23 42); color: rgb(248 250 252); padding: 0.75rem 1rem;"
		>
			Sticky application header
		</header>
		<p style="margin-block: 1rem; max-inline-size: 40ch;">
			Body copy under competing layers. The dialog must remain interactive above this content.
		</p>
		<div
			style="position: fixed; inset: 0; z-index: 2147483000; background: rgb(30 64 175);"
			aria-hidden="true"
		></div>
	</main>
</Story>
