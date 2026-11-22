<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CommandPalette from './CommandPalette.svelte';
	import { CommandRegistry } from './registry.js';
	import { assertCentreHit, assertRectInside, waitForElement } from '../../test/top-layer-probe.js';

	function noop(): void {
		// Stories never navigate; the run() side effect is intentionally empty.
	}

	const registry = new CommandRegistry().register(
		{
			id: 'new-doc',
			title: 'New document',
			subtitle: 'Create a blank file',
			shortcut: '$mod+N',
			run: noop,
		},
		{
			id: 'open',
			title: 'Open…',
			subtitle: 'Open an existing file',
			shortcut: '$mod+O',
			run: noop,
		},
		{ id: 'save', title: 'Save', subtitle: 'Write changes to disk', shortcut: '$mod+S', run: noop },
		{ id: 'search', title: 'Search', keywords: ['find', 'grep'], shortcut: '$mod+F', run: noop },
		{
			id: 'settings',
			title: 'Settings',
			subtitle: 'Open preferences',
			shortcut: '$mod+,',
			run: noop,
		},
		{ id: 'toggle-theme', title: 'Toggle theme', keywords: ['dark', 'light'], run: noop },
		{ id: 'logout', title: 'Log out', group: 'Account', run: noop },
	);

	const overlayRegistry = new CommandRegistry().register(
		{ id: 'alpha', title: 'Alpha command', run: noop },
		{ id: 'bravo', title: 'Bravo command', run: noop },
		{ id: 'charlie', title: 'Charlie command', run: noop },
		{ id: 'delta', title: 'Delta command', run: noop },
		{ id: 'echo', title: 'Echo command', run: noop },
	);

	const empty = new CommandRegistry();

	const { Story } = defineMeta({
		title: 'ui/cmd/CommandPalette',
		component: CommandPalette,
		tags: ['autodocs'],
		// Rendered open so the combobox/listbox is visible in the canvas; in an app
		// it toggles via `$mod+K`.
		args: {
			registry,
			open: true,
		},
	});
</script>

<!-- Open with a full command set; arrow keys + Enter drive selection. -->
<Story name="Open" args={{ registry, open: true }} />

<!-- A custom placeholder and shortcut hint. -->
<Story
	name="Custom placeholder"
	args={{ registry, open: true, placeholder: 'Jump to a command…' }}
/>

<!-- Empty registry exercises the "No commands found." empty state. -->
<Story name="Empty" args={{ registry: empty, open: true }} />

<!-- Sticky/fixed/transformed page content must not cover the top-layer palette. -->
<Story
	name="Over page content"
	asChild
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const panel = await waitForElement(canvasElement, '.ssentio-cmd__panel');
		assertCentreHit(panel, 'Panel centre');

		const input = panel.querySelector<HTMLInputElement>('[role="combobox"]');
		if (!input || document.activeElement !== input) {
			throw new Error('Expected combobox input to have focus after open');
		}

		const listbox = panel.querySelector<HTMLElement>('[role="listbox"]');
		if (!listbox) throw new Error('Expected listbox inside the panel');

		const options = listbox.querySelectorAll<HTMLElement>('[role="option"]');
		if (options.length !== 5) {
			throw new Error(`Expected exactly 5 command options, got ${options.length}`);
		}

		const listRect = listbox.getBoundingClientRect();
		const viewport = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
		for (let i = 0; i < 5; i += 1) {
			const option = options[i];
			if (!option) throw new Error(`Option ${i} missing`);
			const optRect = option.getBoundingClientRect();
			assertRectInside(optRect, viewport, `Option ${i} in viewport`);
			assertRectInside(optRect, listRect, `Option ${i} in listbox`);
			assertCentreHit(option, `Option ${i}`);
		}
	}}
>
	<main style="background: Canvas; color: CanvasText; min-block-size: 120vh; padding: 1rem;">
		<h1 style="font-size: 1.25rem; font-weight: 600; margin-block-end: 0.75rem;">Workspace</h1>
		<div
			style="transform: translateZ(0); overflow: hidden; block-size: 120px; inline-size: 240px; border: 1px solid CanvasText;"
		>
			<CommandPalette registry={overlayRegistry} open={true} idBase="overlay-cmd" />
		</div>
		<header
			style="position: sticky; inset-block-start: 0; z-index: 2147483000; background: rgb(15 23 42); color: rgb(248 250 252); padding: 0.75rem 1rem;"
		>
			Sticky application header
		</header>
		<p style="margin-block: 1rem; max-inline-size: 40ch;">
			Body copy under competing layers. The palette must remain interactive above this content.
		</p>
		<div
			style="position: fixed; inset: 0; z-index: 2147483000; background: rgb(30 64 175);"
			aria-hidden="true"
		></div>
	</main>
</Story>
