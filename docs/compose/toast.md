# Toast — svelte-sonner + `@sveltesentio/ui/toast` preset sizing

`@sveltesentio/ui/toast` ships the pure `toastPreset()` sizing helper (plus its TypeScript types `ToastPreset`, `ToastPosition`, and `ToasterPreset`) and nothing else. Your app installs `svelte-sonner`, imports `Toaster` and `toast` from `'svelte-sonner'`, and spreads `<Toaster {...p.toaster} />` so viewport placement, toaster width, stacking gap, padding, font-size, corner radius, and action/cancel button target sizes scale with the active interface preset.

See [ADR-0007](../adr/0007-svelte-sonner-toast-primitive.md) (`svelte-sonner` primitive lock) and [ADR-0016](../adr/0016-ui-toast-thin-wrapper-preset-sizing.md) (preset-sizing helper scope and `<Toaster {...p.toaster} />` delivery path). Related: [ADR-0047](../adr/0047-per-interface-presets.md) (per-interface presets), [ADR-0030](../adr/0030-mode-watcher-pin.md) (`mode-watcher` pin), and [`@sveltesentio/ui` README](../../packages/ui/README.md).

## Install

```bash
pnpm add svelte-sonner @sveltesentio/ui
# Optional dark-mode sync via mode-watcher:
pnpm add mode-watcher
```

`@sveltesentio/ui` declares `svelte-sonner` (`>=1.0.0 <2`) and `mode-watcher` (`>=1.1.0 <2`) as optional peers alongside `svelte` (`>=5.56.4`). Install `svelte-sonner` `>=1.2.0` (`1.2.1` in workspace) so expanded toast stacks read the preset `gap` prop rather than `svelte-sonner`'s legacy `14px` constant.

## Mount once

Mount a single `<Toaster>` in your root `src/routes/+layout.svelte` and spread `p.toaster` from `toastPreset()`. Pass the same `InterfaceType` (`'desktop' | 'dashboard' | '10foot' | 'handheld'`) or `InterfacePreset` object from `@sveltesentio/ui/presets` that your app passes to `presetCss(preset, selector?)` or stamps onto `[data-interface="<name>"]`:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { Toaster } from 'svelte-sonner';
  import type { InterfaceType } from '@sveltesentio/ui/presets';
  import { toastPreset } from '@sveltesentio/ui/toast';
  import type { LayoutProps } from './$types';

  let { children, data }: LayoutProps = $props();

  const interfaceType = $derived<InterfaceType>(data.interfaceType ?? 'desktop');
  const p = $derived(toastPreset(interfaceType));
</script>

<div data-interface={interfaceType}>
  {@render children()}
</div>

<Toaster {...p.toaster} />
```

`data.interfaceType` is a value the app's root `+layout.ts` or `+layout.server.ts` `load` returns (typed `InterfaceType`), the same value it puts on `data-interface`; `@sveltesentio/ui` does not classify the device.

`@sveltesentio/core`'s `SentioConfig.interfaceType` ([sentio-config.md](sentio-config.md)) names the TV preset `'tenfoot'`, which `toastPreset()` does not accept (`@sveltesentio/ui/presets` uses `'10foot'`); map it in the `load` that returns `data.interfaceType`:

```ts
import type { InterfaceType as ConfigInterfaceType } from '@sveltesentio/core';
import type { InterfaceType } from '@sveltesentio/ui/presets';

export function toUiInterface(value: ConfigInterfaceType): InterfaceType {
  return value === 'tenfoot' ? '10foot' : value;
}
```

`toastPreset()` accepts either an `InterfaceType` name or a full `InterfacePreset` object, so a single-interface app can pass the same preset constant to both `presetCss()` (which scopes `--ui-*` custom properties to `[data-interface="<name>"]` by default) and `toastPreset()`:

```ts
import { presetHandheld, presetCss } from '@sveltesentio/ui/presets';
import { toastPreset } from '@sveltesentio/ui/toast';

const css = presetCss(presetHandheld);
const p = toastPreset(presetHandheld);
```

`svelte-sonner` 1.2.1 defaults on `<Toaster>` are `duration: 4000`, `closeButton: false`, `richColors: false`, `theme: 'light'`, and `containerAriaLabel: 'Notifications'`. Pass app-level props such as `richColors` or `closeButton` alongside `{...p.toaster}` without replacing `p.toaster.style` or `p.toaster.toastOptions`.

## Fire a toast

Import `toast` directly from `'svelte-sonner'` (`svelte-sonner` also exports `Toaster`, `useSonner`, `Icon`, `Loader`, and types `ToastT`, `ExternalToast`, `ToasterProps`, `ToastOptions`). Pass the `id` returned by `toast.loading()` to `toast.success()` or `toast.error()` to update the existing toast in place (suits short work; for longer work of unknown duration, see `toast.promise()` below):

```svelte
<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { api } from '#lib/api/client.js';

  let saving = $state(false);

  async function save() {
    saving = true;
    const id = toast.loading('Saving...');
    try {
      const { error } = await api.PUT('/v1/flow', { body: { enabled: true } });
      if (error) throw error;
      toast.success('Saved', { id });
    } catch {
      toast.error('Save failed', { id });
    } finally {
      saving = false;
    }
  }
</script>

<button type="button" disabled={saving} onclick={save}>Save</button>
```

`svelte-sonner` provides typed variants and `toast.promise()` for async lifecycles:

```ts
import { toast } from 'svelte-sonner';
import { ProblemError } from '@sveltesentio/core/problem';
import { api } from '#lib/api/client.js';

toast('Changes queued');
toast.info('Sync started');
toast.warning('Quota above 80%');

async function saveFlow(): Promise<void> {
  const { response } = await api.PUT('/v1/flow', { body: { enabled: true } });
  if (!response.ok) {
    throw new ProblemError({
      type: 'about:blank',
      title: response.statusText || 'Save failed',
      status: response.status,
    });
  }
}

toast.promise(saveFlow(), {
  loading: 'Saving...',
  success: () => 'Saved',
  error: () => 'Save failed',
});

// Pass a toast id to dismiss one toast, or omit id to dismiss all:
toast.dismiss();
```

`problemMiddleware()` already throws for `application/problem+json` failures; the `response.ok` check covers other non-2xx responses, which resolve instead of rejecting.

Per-toast `ExternalToast` / `ToastOptions` options include `description`, `action`, `cancel`, `important`, `duration`, `richColors`, `closeButton`, and `dismissible`.

## Errors + ProblemError

`problemMiddleware()` from `@sveltesentio/core/http` throws `ProblemError` from `'@sveltesentio/core/problem'` (RFC 9457 — see [http-client.md](http-client.md)) for non-2xx `application/problem+json` responses, carrying `title`, `detail`, `status`, `type`, `invalidParams`, and `message`, which falls back from `detail` to `title`, then to `Problem: <type> (<status>)`; other non-2xx responses resolve with `{ error, response }`. Narrow with `instanceof ProblemError`: route field-level validation (`invalidParams`) to inline form state via `problemToFieldErrors` from `'@sveltesentio/forms'` ([forms.md](forms.md)), toast non-field `ProblemError` instances with `err.title ?? err.message` and `{ description: err.detail }`, and log any other `unknown` value with `console.error` before showing a fixed generic message — never pass raw `String(err)` of an untyped catch binding to a toast:

```ts
import { toast } from 'svelte-sonner';
import { ProblemError } from '@sveltesentio/core/problem';
import { problemToFieldErrors, type FieldErrors } from '@sveltesentio/forms';
import { api } from '#lib/api/client.js';

export type CreateFlowResult = { ok: true } | { ok: false; fieldErrors: FieldErrors | null };

export async function createFlow(name: string): Promise<CreateFlowResult> {
  try {
    const { response } = await api.POST('/v1/flows', { body: { name } });
    if (!response.ok) {
      throw new ProblemError({
        type: 'about:blank',
        title: response.statusText || 'Unable to create flow',
        status: response.status,
      });
    }
    toast.success('Flow created');
    return { ok: true };
  } catch (err: unknown) {
    if (err instanceof ProblemError) {
      if (err.invalidParams && err.invalidParams.length > 0) {
        return { ok: false, fieldErrors: problemToFieldErrors(err) };
      }
      toast.error(err.title ?? err.message, { description: err.detail });
      return { ok: false, fieldErrors: null };
    }
    console.error('create_flow_failed', { error: err });
    toast.error('Unable to create flow');
    return { ok: false, fieldErrors: null };
  }
}
```

## Action toasts

Pass `action` and optional `cancel` descriptors when a transient notification offers an immediate follow-up such as undo:

```ts
import { toast } from 'svelte-sonner';

export function notifyArchive(restoreDraft: () => void): void {
  toast('Draft archived', {
    description: 'Moved to archive.',
    action: {
      label: 'Undo',
      onClick: () => restoreDraft(),
    },
    cancel: {
      label: 'Dismiss',
      onClick: () => undefined,
    },
  });
}
```

When `<Toaster {...p.toaster} />` is mounted, `p.toaster.toastOptions.actionButtonStyle` and `p.toaster.toastOptions.cancelButtonStyle` apply `min-height` and `min-width` equal to the preset's `minTargetSize` (`24px` on `desktop` and `dashboard`, `44px` on `10foot` and `handheld`), raising the `24px` button height that `svelte-sonner` sets.

## Theming

`svelte-sonner`'s `<Toaster>` accepts `theme?: 'light' | 'dark' | 'system'` (default `'light'`). `@sveltesentio/ui/toast` ships no theme binding ([ADR-0016](../adr/0016-ui-toast-thin-wrapper-preset-sizing.md)); your app passes `theme` explicitly.

With `mode-watcher` 1.x (`mode.current`, optional peer `>=1.1.0 <2`, [ADR-0030](../adr/0030-mode-watcher-pin.md)):

```svelte
<script lang="ts">
  import { mode } from 'mode-watcher';
  import { Toaster } from 'svelte-sonner';
  import { toastPreset } from '@sveltesentio/ui/toast';

  const p = toastPreset('desktop');
</script>

<Toaster {...p.toaster} theme={mode.current ?? 'system'} />
```

Without `mode-watcher`, pass a `ThemeMode` (`'light' | 'dark' | 'system'`) or a `resolveMode(mode, systemPrefersDark)` result from `@sveltesentio/ui/theme-toggle`:

```svelte
<script lang="ts">
  import { Toaster } from 'svelte-sonner';
  import { resolveMode, type ThemeMode } from '@sveltesentio/ui/theme-toggle';
  import { toastPreset } from '@sveltesentio/ui/toast';

  let mode = $state<ThemeMode>('system');
  // Updated by the app's own prefers-color-scheme media query listener:
  let systemPrefersDark = $state(false);

  const p = toastPreset('desktop');
  const resolved = $derived(resolveMode(mode, systemPrefersDark));
</script>

<Toaster {...p.toaster} theme={resolved} />
```

Keep custom toast surfaces on the semantic oklch token pipeline ([theming.md](theming.md)) — never hard-code hex, RGB, HSL, or raw `oklch()` literals in component styles.

## Preset sizing

`toastPreset(interfaceType)` derives toast geometry from `@sveltesentio/ui/presets` (`spacingScale`, `baseFontSize`, `radius`, `minTargetSize`): padding scales `0.75rem 1rem` by `spacingScale`, viewport `offset` scales `1rem` by `spacingScale`, and `toaster.gap` converts `0.75rem * spacingScale` at `1rem = 16px`.

<!-- toast-preset-table:start -->

| Interface   | position        | width   | offset     | gap (px) | padding              | font-size | radius     | button min size |
| ----------- | --------------- | ------- | ---------- | -------- | -------------------- | --------- | ---------- | --------------- |
| `desktop`   | `bottom-right`  | `356px` | `1rem`     | `12`     | `0.75rem 1rem`       | `16px`    | `0.5rem`   | `24px`          |
| `dashboard` | `bottom-right`  | `320px` | `0.875rem` | `10.5`   | `0.6563rem 0.875rem` | `14px`    | `0.375rem` | `24px`          |
| `10foot`    | `top-center`    | `40rem` | `1.5rem`   | `18`     | `1.125rem 1.5rem`    | `20px`    | `0.75rem`  | `44px`          |
| `handheld`  | `bottom-center` | `92vw`  | `1.25rem`  | `15`     | `0.9375rem 1.25rem`  | `17px`    | `0.625rem` | `44px`          |

<!-- toast-preset-table:end -->

What `<Toaster {...p.toaster} />` delivers to the mounted DOM ([ADR-0016](../adr/0016-ui-toast-thin-wrapper-preset-sizing.md)):

- `p.toaster.position` and `p.toaster.offset` set viewport placement and edge inset above `svelte-sonner`'s `600px` mobile breakpoint. At `600px` and below (`@media (max-width: 600px)`), `svelte-sonner` 1.2.1 insets from its own `mobileOffset` prop (default `'16px'`) and sizes each toast to `calc(100% - var(--mobile-offset-left) * 2)`, so preset `offset` and `width` do not apply there ([ADR-0016](../adr/0016-ui-toast-thin-wrapper-preset-sizing.md) leaves that mobile layout unchanged). `toastPreset()` sets no `mobileOffset`; an app wanting the preset inset on narrow viewports passes `mobileOffset={p.toaster.offset}` alongside `{...p.toaster}`.
- `p.toaster.gap` sets `style:--gap` (in CSS `px`) on the toaster `<ol>`. Expanded-stack spacing reads `gap` starting in `svelte-sonner` `1.2.0`; on `1.0.x` and `1.1.x` (still accepted by the `>=1.0.0 <2` optional peer range), expanded offsets stay at `svelte-sonner`'s fixed `14px` ([`@sveltesentio/ui` README](../../packages/ui/README.md)).
- `p.toaster.style` sets `min-width: min(<width>, 100% - 2 * <offset>);` on every position-group `<ol>` (`[data-sonner-toaster]`) so toasts wider than `svelte-sonner`'s `356px` list default expand cleanly while clamping to the viewport; below `svelte-sonner`'s `600px` mobile breakpoint, mobile `width: 100%` rules remain intact.
- `p.toaster.toastOptions.style` sets semicolon-terminated `--width: min(<width>, 100%); --border-radius: <radius>; padding: <padding>; font-size: <baseFontSize>;` on each toast `<li>` (`[data-sonner-toast]`).
- `p.toaster.toastOptions.actionButtonStyle` and `p.toaster.toastOptions.cancelButtonStyle` set `min-height: <minTargetSize>; min-width: <minTargetSize>;` on toast action and cancel buttons.
- `p.style` on `ToastPreset` is a legacy `Readonly<Record<string, string>>` inspection map retained for append-only compatibility; `svelte-sonner` does not read it.
- **Known limit**: `dashboard` (`320px`, narrower than `svelte-sonner`'s `356px` `<ol>` default) under a per-toast `*-center` `position` override aligns to the start edge of the `356px` list and sits `18px` off viewport centre ([ADR-0016](../adr/0016-ui-toast-thin-wrapper-preset-sizing.md), amendment 2026-11-21).

## A11y

- **Live regions (WCAG 2.2 SC 4.1.3 Status Messages)**: `svelte-sonner` 1.2.1 wraps the toast lists in a `<section>` labelled with `containerAriaLabel` (default `'Notifications'`) plus the hotkey label and sets `aria-live="polite"` (`aria-relevant="additions text"`, `aria-atomic="false"`) on that `<section>`. Each toast `<li>` sets `aria-live="assertive"` when `{ important: true }` and `aria-live="polite"` otherwise (`aria-atomic="true"`). Reserve `important: true` for urgent failures that require immediate interruption.
- **Keyboard navigation**: `Alt+T` (default `hotkey`) expands the stack and moves focus to the toast list; `Escape` collapses the stack when focus is inside the list; when focus leaves the list, focus returns to the previously focused element.
- **Target size (WCAG 2.2 SC 2.5.8)**: `actionButtonStyle` and `cancelButtonStyle` enforce `24px` minimum targets on pointer-fine presets (`desktop`, `dashboard`) and `44px` on touch and D-pad presets (`handheld`, `10foot`).

## Testing

Unit-test pure preset calculations in Node without a DOM, and mount `svelte-sonner`'s `<Toaster {...p.toaster} />` via `@testing-library/svelte` when asserting rendered styles:

```ts
import { describe, expect, it } from 'vitest';
import { toastPreset, type ToasterPreset } from '@sveltesentio/ui/toast';

describe('toastPreset', () => {
  it('computes 10foot toaster props', () => {
    const toaster: ToasterPreset = toastPreset('10foot').toaster;
    expect(toaster.position).toBe('top-center');
    expect(toaster.gap).toBe(18);
    expect(toaster.toastOptions.actionButtonStyle).toContain('min-height: 44px;');
  });
});
```

Component test mounting `<Toaster {...p.toaster} />` (`svelte-sonner` renders `[data-sonner-toaster]` only when at least one toast is active; see [`packages/ui/test/Toaster.svelte.test.ts`](../../packages/ui/test/Toaster.svelte.test.ts) for the full worked example, including `inlineDeps: ['svelte-sonner', 'runed']` in Vitest config):

```ts
import { render } from '@testing-library/svelte';
import { Toaster, toast } from 'svelte-sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastPreset } from '@sveltesentio/ui/toast';

describe('<Toaster {...p.toaster} />', () => {
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

  it('forwards the preset gap to the toaster list', async () => {
    const p = toastPreset('10foot');
    const { container, unmount } = render(Toaster, { ...p.toaster });
    toast('probe');
    const assertMounted = () => {
      expect(container.querySelector('[data-sonner-toast]')).not.toBeNull();
    };
    await vi.waitFor(assertMounted, { timeout: 1000 });
    const ol = container.querySelector<HTMLElement>('[data-sonner-toaster]');
    expect(ol?.getAttribute('style')).toContain('--gap: 18px');
    unmount();
  });
});
```

## Anti-patterns

- **Passing `p.style` to `toastOptions.style`.** `p.style` is an object map retained for inspection; `svelte-sonner` expects a semicolon-terminated inline CSS string and drops the preset width when given `p.style` ([`Toaster.svelte.test.ts`](../../packages/ui/test/Toaster.svelte.test.ts)). Spread `<Toaster {...p.toaster} />` instead.
- **Mounting `<Toaster>` without `toastPreset()`.** `@sveltesentio/ui/toast` does not wrap `<Toaster>` at runtime; mounting a bare `<Toaster />` skips preset width, padding, font-size, offset, gap, and the `44px` action/cancel target-size floor on `10foot` and `handheld`.
- **Mounting a second `<Toaster>` without `id`.** Two `<Toaster>` instances without `id` both render every toast that has no `toasterId`, so each toast shows twice. Mount one default `<Toaster>` in the root `+layout.svelte`; a deliberate second region takes `id` on `<Toaster>` and passes `{ toasterId }` when firing its toasts.
- **Toasting form validation errors.** Field-level `ProblemError` `invalidParams` belong inline next to their inputs via `problemToFieldErrors` from `@sveltesentio/forms` ([forms.md](forms.md)), not in a transient toast.
- **Toasting raw `String(err)` of an `unknown` catch value.** Untyped thrown values can expose internal details or render `[object Object]`; narrow `err instanceof ProblemError` and fall back to a fixed generic message.
- **Long toast durations (`duration: 30000`) for persistent state.** Toasts auto-dismiss (`4000` ms default) and are transient by contract; use an inline alert or banner for persistent status.
- **Misusing `toast.loading()` for work of unknown length.** Plain `toast.loading()` auto-closes after `duration` (`4000` ms default), possibly before the work ends, and calling `toast.success()` without `{ id }` stacks beside it instead of replacing it. For work of unknown length, use `toast.promise()`. If the loading toast is given `duration: Infinity`, a `toast.success(message, { id })` update merges onto it, inherits `Infinity`, and never closes unless it passes its own finite `duration`.
- **Hard-coded color literals in custom toast styles.** Reference semantic oklch tokens ([theming.md](theming.md)) so light/dark mode and tenant overrides cascade cleanly.

## References

- [ADR-0007](../adr/0007-svelte-sonner-toast-primitive.md) — `svelte-sonner` toast primitive lock.
- [ADR-0016](../adr/0016-ui-toast-thin-wrapper-preset-sizing.md) — `@sveltesentio/ui/toast` shipped helper scope and `<Toaster {...p.toaster} />` delivery path.
- [ADR-0030](../adr/0030-mode-watcher-pin.md) — `mode-watcher` `>=1.1.0 <2` runes-native peer pin.
- [ADR-0047](../adr/0047-per-interface-presets.md) — per-interface presets (`desktop`, `dashboard`, `10foot`, `handheld`).
- [theming.md](theming.md) — oklch semantic token pipeline.
- [http-client.md](http-client.md) — `openapi-fetch` + RFC 9457 `ProblemError`.
- [forms.md](forms.md) — Superforms and `problemToFieldErrors`.
- [`@sveltesentio/ui` README](../../packages/ui/README.md) — package sub-exports and optional peer matrix.
- [`Toaster.svelte.test.ts`](../../packages/ui/test/Toaster.svelte.test.ts) — component tests verifying `<Toaster {...p.toaster} />` DOM output.
- [svelte-sonner README](https://github.com/wobsoriano/svelte-sonner#readme) — upstream API reference.
