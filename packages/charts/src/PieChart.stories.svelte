<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PieChart from './PieChart.svelte';
	import { assertBlockSize, remPx, waitForPlot } from '../test/viz-size-probe.js';

	// One flat datum per slice; `key` labels the slice, `value` sizes it.
	interface Slice {
		name: string;
		count: number;
	}

	const data: Slice[] = [
		{ name: 'Chrome', count: 62 },
		{ name: 'Firefox', count: 18 },
		{ name: 'Safari', count: 12 },
		{ name: 'Edge', count: 8 },
	];

	const key = (d: Slice): string => d.name;
	const value = (d: Slice): number => d.count;

	const { Story } = defineMeta<unknown, typeof PieChart<Slice>>({
		title: 'charts/PieChart',
		component: PieChart,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			title: 'Browser share',
			data,
			key,
			value,
		},
	});
</script>

<Story
	name="Default size"
	args={{ title: 'Browser share', data, key, value }}
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const { viz } = await waitForPlot(canvasElement);
		assertBlockSize(viz, remPx(16), 'PieChart default viz');
	}}
/>

<!-- Slices colored from the semantic oklch palette; one SR row per slice. -->
<Story name="Default" args={{ title: 'Browser share', data, key, value }} />

<!-- A custom value-column label + describing summary. -->
<Story
	name="Custom value label"
	args={{
		title: 'Browser share',
		description: 'Share of sessions by browser, last 30 days.',
		data,
		key,
		value,
		valueLabel: 'Share %',
	}}
/>
