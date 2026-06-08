import { describe, it, expect, afterEach } from "vitest";
import { isTextEntryTarget, isInModal } from "./shortcutGuard";

function makeInput(type?: string): HTMLInputElement {
  const el = document.createElement("input");
  if (type !== undefined) el.type = type;
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isTextEntryTarget", () => {
  it("is true for text-like inputs", () => {
    for (const type of ["text", "search", "email", "url", "tel", "password", "number"]) {
      expect(isTextEntryTarget(makeInput(type))).toBe(true);
    }
  });

  it("is true for an input with no explicit type (defaults to text)", () => {
    expect(isTextEntryTarget(makeInput())).toBe(true);
  });

  it("is true for <textarea> and contentEditable", () => {
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true);
    // jsdom does not compute `isContentEditable` from the attribute, so stub the
    // property to exercise our branch (production uses the same `el.isContentEditable`
    // check that useCompositeList.ts relies on in a real browser).
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTextEntryTarget(div)).toBe(true);
  });

  it("is false for a slider thumb (input type=range) and other non-text inputs", () => {
    for (const type of ["range", "checkbox", "radio", "button", "submit"]) {
      expect(isTextEntryTarget(makeInput(type))).toBe(false);
    }
  });

  it("is false for buttons and plain elements", () => {
    expect(isTextEntryTarget(document.createElement("button"))).toBe(false);
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false);
  });

  it("is false for null", () => {
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe("isInModal", () => {
  it.each([
    ['role="dialog"', "dialog"],
    ['role="alertdialog"', "alertdialog"],
  ])("is true inside an element with %s", (_label, role) => {
    const modal = document.createElement("div");
    modal.setAttribute("role", role);
    const child = document.createElement("button");
    modal.appendChild(child);
    document.body.appendChild(modal);
    expect(isInModal(child)).toBe(true);
  });

  it("is true inside aria-modal and data-modal containers", () => {
    const ariaModal = document.createElement("div");
    ariaModal.setAttribute("aria-modal", "true");
    const dataModal = document.createElement("div");
    dataModal.setAttribute("data-modal", "true");
    document.body.append(ariaModal, dataModal);
    expect(isInModal(ariaModal)).toBe(true);
    expect(isInModal(dataModal)).toBe(true);
  });

  it("is false outside any modal and for null", () => {
    const loose = document.createElement("button");
    document.body.appendChild(loose);
    expect(isInModal(loose)).toBe(false);
    expect(isInModal(null)).toBe(false);
  });

  it("is false for a text field outside any modal", () => {
    // The global Tier-2 listener gates on isInModal only, so a focused search box
    // (not inside a modal) does NOT suppress shortcuts — e.g. Alt+2 still switches
    // section while typing. Text-entry collision is the concern of unmodified row
    // keys (useCompositeList), not these modified/F-key global combos.
    const input = makeInput("search");
    document.body.appendChild(input);
    expect(isInModal(input)).toBe(false);
  });
});
