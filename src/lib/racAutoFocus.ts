import type { TabProps } from "react-aria-components";

/**
 * `autoFocus` for a react-aria `<Tab>` — the prop RAC forwards but does not type.
 *
 * `useTab` spreads the tab's own props into `useFocusable`, which honours
 * `autoFocus` and focuses the element on mount. Only the JSX type is missing:
 * `TabProps` does not extend `FocusableProps`. One cast here beats the same
 * `@ts-expect-error` on every dialog that opens with its tab list focused.
 *
 * Used by dialogs whose first Tab must take focus, so arrow keys reach the tab
 * list at once instead of the dialog container. Guarded by the SettingsDialog
 * and ProfileSettingsDialog keyboard tests — if RAC ever stops forwarding it,
 * those go red, not this file.
 */
export const autoFocusTab = { autoFocus: true } as TabProps;
