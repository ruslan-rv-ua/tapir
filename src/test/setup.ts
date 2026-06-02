import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

// Set the paraglide locale to English before any tests run.
// The default base locale is "uk" (Ukrainian); paraglide message functions read
// the locale lazily via getLocale(), which checks document.cookie first.
// Setting the cookie here ensures all tests that render components with i18n
// strings see English labels (matching vi.mock factories and test assertions).
beforeAll(() => {
  document.cookie = "PARAGLIDE_LOCALE=en; path=/";
});

// Unmount React trees between tests so focus/DOM state never leaks across cases.
afterEach(() => cleanup());
