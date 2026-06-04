import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement scrollIntoView; components (e.g. CommandPalette) call
// it to keep the active item in view. No-op it so those effects don't throw.
Element.prototype.scrollIntoView = () => {};

// Unmount React trees between tests so focus/DOM state never leaks across cases.
afterEach(() => cleanup());
