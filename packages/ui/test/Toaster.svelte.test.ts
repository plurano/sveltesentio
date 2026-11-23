// Component-render tests verifying that `toastPreset(...).toaster` delivers
// preset sizing, toaster min-width, stacking gap, viewport offset, and action
// button target-size floor to a real mounted `svelte-sonner` `<Toaster>` (ADR-0016, #643).
// Also verifies per-toast expanded-stack `--offset` follows the preset `gap` (#648).
import { render } from '@testing-library/svelte';
import { Toaster, toast } from 'svelte-sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastPreset } from '../src/toast/index.js';

/**
 * jsdom 31 simplifies `calc()` terms when it serialises a declaration, so the
 * preset's `100% - 2 * 1.5rem` reads back as `100% - 3rem` on the mounted `<ol>`.
 */
const MOUNTED_10FOOT_MIN_WIDTH = 'min(40rem, 100% - 3rem)';

/** Find the first mounted toast matching `selector` (and `title`, when given). */
function findToast(
	container: HTMLElement,
	selector: string,
	title: string | undefined,
): HTMLElement | null {
	for (const el of container.querySelectorAll<HTMLElement>(selector)) {
		if (title === undefined) return el;
		const text = el.querySelector('[data-title]')?.textContent?.trim();
		if (el.matches('[data-sonner-toast]') && text === title) return el;
	}
	return null;
}

/**
 * Poll boundedly (<= 20 ticks, 10 ms each) for a mounted toast matching
 * `selector` (and `title`, when given).
 */
async function waitForToast(
	container: HTMLElement,
	selector = '[data-sonner-toast]',
	title?: string,
): Promise<HTMLElement | null> {
	for (let tick = 0; tick < 20; tick += 1) {
		const el = findToast(container, selector, title);
		if (el !== null) return el;
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 10);
		});
	}
	return findToast(container, selector, title);
}

interface MountedToast {
	readonly id: ReturnType<typeof toast>;
	readonly li: HTMLElement;
}

/** Issues an Undo probe toast with `title` and resolves its id and mounted element. */
async function mountActionToast(container: HTMLElement, title: string): Promise<MountedToast> {
	const id = toast(title, {
		action: {
			label: 'Undo',
			onClick: () => undefined,
		},
	});
	const li = await waitForToast(container, '[data-sonner-toast]', title);
	expect(li).not.toBeNull();
	if (li === null) {
		throw new Error(`expected [data-sonner-toast] "${title}" to mount`);
	}
	return { id, li };
}

/** Issues a plain toast with `title` and resolves its id and mounted element. */
async function mountPlainToast(container: HTMLElement, title: string): Promise<MountedToast> {
	const id = toast(title);
	const element = await waitForToast(container, '[data-sonner-toast]', title);
	if (element === null) {
		throw new Error(`plain toast "${title}" did not mount`);
	}
	return { id, li: element };
}

describe('<Toaster {...toastPreset().toaster}>', () => {
	beforeEach(() => {
		vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => undefined,
			removeListener: () => undefined,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			dispatchEvent: () => false,
		}));
	});

	afterEach(() => {
		toast.dismiss();
		vi.unstubAllGlobals();
	});

	it('applies 10foot width, padding, font-size, toaster min-width, gap, offset and button target floor on a mounted toast', async () => {
		const p = toastPreset('10foot');
		const { container, unmount } = render(Toaster, { ...p.toaster });
		const { id, li } = await mountActionToast(container, 'probe 10foot preset');

		const liStyle = li.getAttribute('style') ?? '';
		expect(liStyle).toContain('--width: min(40rem, 100%)');
		expect(liStyle).toContain('padding: 1.125rem 1.5rem');
		expect(liStyle).toContain('font-size: 20px');
		expect(liStyle).not.toContain('inset');
		expect(liStyle).not.toContain(' undefined');

		const button = container.querySelector<HTMLElement>('[data-button]');
		expect(button).not.toBeNull();
		// Read longhands: jsdom 31 serialises min-width + min-height as `min-size`.
		expect(button?.style.minHeight).toBe('44px');
		expect(button?.style.minWidth).toBe('44px');

		const ol = container.querySelector<HTMLElement>('[data-sonner-toaster]');
		expect(ol).not.toBeNull();
		expect(ol?.style.minWidth).toBe(MOUNTED_10FOOT_MIN_WIDTH);
		const olStyle = ol?.getAttribute('style') ?? '';
		expect(olStyle).toContain('--gap: 18px');
		expect(olStyle).toContain('1.5rem');

		toast.dismiss(id);
		unmount();
	});

	it('drops preset width when the object style map is passed directly to toastOptions.style', async () => {
		const p = toastPreset('10foot');
		const { container, unmount } = render(Toaster, {
			position: p.position,
			toastOptions: {
				// Cast reproduces why the pre-#643 path (`toastOptions={{ style: p.style }}`)
				// failed at runtime: svelte-sonner expects a semicolon-terminated style string
				// and drops the object map.
				style: p.style as unknown as string,
			},
		});
		const { id, li } = await mountActionToast(container, 'probe object style map');

		expect(li.getAttribute('style') ?? '').not.toContain('40rem');

		toast.dismiss(id);
		unmount();
	});

	it('keeps preset width and alignment on a per-toast position override', async () => {
		const { container, unmount } = render(Toaster, { ...toastPreset('10foot').toaster });
		const id = toast('probe', { position: 'bottom-right' });

		// Dismissed toasts from earlier tests stay in svelte-sonner's shared state
		// and render in the default top-center list, so select the override's list.
		const li = await waitForToast(
			container,
			'[data-sonner-toaster][data-y-position="bottom"][data-x-position="right"] [data-sonner-toast]',
		);
		expect(li).not.toBeNull();
		expect(li?.getAttribute('data-x-position')).toBe('right');
		expect(li?.getAttribute('data-y-position')).toBe('bottom');
		const ol = li?.closest<HTMLElement>('[data-sonner-toaster]') ?? null;
		expect(ol).not.toBeNull();
		expect(ol?.style.minWidth).toBe(MOUNTED_10FOOT_MIN_WIDTH);
		const liStyle = li?.getAttribute('style') ?? '';
		expect(liStyle).toContain('--width: min(40rem, 100%)');
		expect(liStyle).not.toContain('inset');

		toast.dismiss(id);
		unmount();
	});

	it('applies 10foot preset gap to expanded-stack --offset with newest toast at 0px', async () => {
		const p = toastPreset('10foot');
		const { container, unmount } = render(Toaster, { ...p.toaster });
		const older = await mountPlainToast(container, 'probe 10foot toast A');
		const newest = await mountPlainToast(container, 'probe 10foot toast B');

		expect(newest.li.style.getPropertyValue('--offset')).toBe('0px');
		expect(older.li.style.getPropertyValue('--offset')).toBe('18px');
		expect(older.li.style.getPropertyValue('--offset')).toBe(`${p.toaster.gap}px`);

		toast.dismiss(older.id);
		toast.dismiss(newest.id);
		unmount();
	});

	it('applies handheld preset gap to expanded-stack --offset instead of fixed 14px', async () => {
		const preset = toastPreset('handheld');
		expect(preset.toaster.gap).not.toBe(18);
		expect(preset.toaster.gap).not.toBe(14);

		const view = render(Toaster, { ...preset.toaster });
		const first = await mountPlainToast(view.container, 'probe handheld toast A');
		const second = await mountPlainToast(view.container, 'probe handheld toast B');

		expect(first.li.style.getPropertyValue('--offset')).toBe(`${preset.toaster.gap}px`);
		expect(second.li.style.getPropertyValue('--offset')).toBe('0px');

		toast.dismiss(first.id);
		toast.dismiss(second.id);
		view.unmount();
	});
});
