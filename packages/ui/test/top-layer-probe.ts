// Hit-test helpers for the "Over page content" stories (#668). They run in the
// real browsers of the Storybook vitest lane, where `elementFromPoint` reports
// what actually paints on top; jsdom has no layout, so unit tests cannot use them.

const POLL_LIMIT = 50;
const POLL_INTERVAL_MS = 20;

/**
 * Poll (bounded: 50 x 20 ms) until `selector` matches inside `root`, and return
 * the match. Selectors name the panel itself, not the native `<dialog>`, so the
 * same story runs (and fails on the hit test) against an inline-rendered mutant.
 */
export async function waitForElement(root: HTMLElement, selector: string): Promise<HTMLElement> {
	for (let i = 0; i < POLL_LIMIT; i += 1) {
		const match = root.querySelector<HTMLElement>(selector);
		if (match) return match;
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	throw new Error(`Expected ${selector} in the story canvas`);
}

/**
 * Name an element for a failure message: tag name plus its first class, or
 * `null` when the hit test found nothing.
 */
export function describeElement(el: Element | null): string {
	if (!el) return 'null';
	const [firstClass] = el.classList;
	return firstClass ? `${el.tagName}.${firstClass}` : el.tagName;
}

/**
 * Throw unless `elementFromPoint` at the centre of `target` returns `target`
 * or one of its descendants, i.e. nothing else paints over that point.
 */
export function assertCentreHit(target: Element, label: string): void {
	const rect = target.getBoundingClientRect();
	const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
	if (hit && target.contains(hit)) return;
	throw new Error(`${label}: centre hit-test expected inside target; got ${describeElement(hit)}`);
}

/**
 * Throw unless `inner` lies fully inside `outer` (both client rects).
 */
export function assertRectInside(
	inner: DOMRect,
	outer: Pick<DOMRect, 'top' | 'left' | 'bottom' | 'right'>,
	label: string,
): void {
	const inside =
		inner.top >= outer.top &&
		inner.left >= outer.left &&
		inner.bottom <= outer.bottom &&
		inner.right <= outer.right;
	if (!inside) throw new Error(`${label}: rect is not fully inside its bounds`);
}
