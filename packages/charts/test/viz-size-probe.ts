// Plot-dimension helpers for semantic chart wrapper stories (#670). They run in
// the Storybook vitest browser lane where layout and getBoundingClientRect are
// real; jsdom has no box model, so unit tests cannot use them.

const POLL_LIMIT = 50;
const POLL_INTERVAL_MS = 20;

/**
 * Name whether an svg or canvas was found under `viz` for timeout errors.
 */
function describePlot(viz: HTMLElement): string {
	const plot = viz.querySelector('svg, canvas');
	return plot ? plot.tagName.toLowerCase() : 'none';
}

/**
 * Poll (bounded: 50 × 20 ms) until `root` holds a `role="img"` viz whose svg or
 * canvas has non-zero width and height. Throws on timeout with the viz rect and
 * whether a plot element was found.
 */
export async function waitForPlot(root: HTMLElement): Promise<{ viz: HTMLElement; plot: Element }> {
	for (let i = 0; i < POLL_LIMIT; i += 1) {
		const viz = root.querySelector<HTMLElement>('[role="img"]');
		if (viz) {
			const plot = viz.querySelector('svg, canvas');
			if (plot) {
				const rect = plot.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					return { viz, plot };
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	const viz = root.querySelector<HTMLElement>('[role="img"]');
	const vizHeight = viz?.getBoundingClientRect().height ?? 0;
	const found = viz ? describePlot(viz) : 'no viz';
	throw new Error(`Expected non-zero plot in role="img"; viz height=${vizHeight}, plot=${found}`);
}

/**
 * Throw unless `el`'s block size (height) matches `expectedPx` within 1 px.
 */
export function assertBlockSize(el: Element, expectedPx: number, label: string): void {
	const rect = el.getBoundingClientRect();
	if (Math.abs(rect.height - expectedPx) <= 1) return;
	throw new Error(`${label}: expected block-size ~${expectedPx}px, got ${rect.height}px`);
}

/**
 * Convert rem to px using the document root font size.
 */
export function remPx(rem: number): number {
	const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
	return rem * rootSize;
}
