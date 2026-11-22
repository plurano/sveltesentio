<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LineChart from './LineChart.svelte';
	import {
		dayAccessors as accessors,
		sampleWeekdaySeries as series,
		singleWeekdaySeries as single,
		type DayPoint,
	} from './stories-data.js';
	import { assertBlockSize, remPx, waitForPlot } from '../test/viz-size-probe.js';

	const { Story } = defineMeta<unknown, typeof LineChart<DayPoint>>({
		title: 'charts/LineChart',
		component: LineChart,
		tags: ['autodocs'],
		parameters: { layout: 'padded' },
		args: {
			title: 'Daily sessions',
			series,
			accessors,
		},
	});
</script>

<!-- Default plot block size (16rem) fills a non-zero LayerChart region (#670). -->
<Story
	name="Default size"
	args={{ title: 'Daily sessions', series, accessors }}
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const { viz } = await waitForPlot(canvasElement);
		assertBlockSize(viz, remPx(16), 'LineChart default viz');
	}}
/>

<Story
	name="Custom height"
	args={{ title: 'Daily sessions', series, accessors, height: '10rem' }}
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const { viz } = await waitForPlot(canvasElement);
		assertBlockSize(viz, remPx(10), 'LineChart custom height viz');
	}}
/>

<!-- Two series, each colored from the semantic oklch palette; the visually
     hidden SR table is generated from the same series + accessors. -->
<Story name="Multi series" args={{ title: 'Daily sessions vs errors', series, accessors }} />

<!-- A single series with a one-sentence aria-describedby summary. -->
<Story
	name="With description"
	args={{
		title: 'Daily sessions',
		description: 'Authenticated sessions per weekday.',
		series: single,
		accessors,
	}}
/>

<!-- Swap the value axis to the x-axis. -->
<Story
	name="Vertical orientation"
	args={{ title: 'Daily sessions', series: single, accessors, orientation: 'vertical' }}
/>
