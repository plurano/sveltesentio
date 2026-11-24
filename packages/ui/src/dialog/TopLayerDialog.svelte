<!--
@component
TopLayerDialog — one shell for every modal the package renders in the top layer
(#668), so the full-screen reset lives once.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLDialogAttributes } from 'svelte/elements';

	interface Props extends HTMLDialogAttributes {
		/** Bound native `<dialog>` element. */
		node?: HTMLDialogElement | null;
		/** Modal content rendered inside the shell. */
		children?: Snippet;
	}

	let { node = $bindable(null), class: className, children, ...rest }: Props = $props();
</script>

<dialog bind:this={node} class={['ssentio-top-layer', className]} {...rest}>
	{@render children?.()}
</dialog>

<style>
	.ssentio-top-layer {
		position: fixed;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
		max-inline-size: none;
		max-block-size: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		overflow: visible;
	}

	.ssentio-top-layer::backdrop {
		background: transparent;
	}
</style>
