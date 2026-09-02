import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { KeyRecorder } from "./KeyRecorder";

const LABEL = "Toggle recording";

/** Render the recorder, arm it (click), and return the record button + onChange spy. */
function arm(value = "") {
  const onChange = vi.fn();
  const { getByRole, queryByRole } = render(
    <KeyRecorder label={LABEL} value={value} onChange={onChange} />,
  );
  // Both buttons embed the label in their accessible name; only the record
  // button's name starts with it (the clear button's is "Clear hotkey: …").
  const button = getByRole("button", { name: (name: string) => name.startsWith(LABEL) });
  fireEvent.click(button);
  return { button, onChange, getByRole, queryByRole };
}

describe("KeyRecorder — physical-position (e.code) recording", () => {
  it("records the Latin accelerator even when e.key is Cyrillic", () => {
    const { button, onChange } = arm();
    // Physical R on a Ukrainian layout reports e.key === "к".
    fireEvent.keyDown(button, {
      code: "KeyR",
      key: "к",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+R");
  });

  it("records the digit, not Shift's punctuation glyph", () => {
    const { button, onChange } = arm();
    // Shift+1 reports e.key === "!"; e.code === "Digit1" is stable.
    fireEvent.keyDown(button, { code: "Digit1", key: "!", altKey: true });
    expect(onChange).toHaveBeenCalledWith("Alt+1");
  });

  it("maps arrow codes to short tokens", () => {
    const { button, onChange } = arm();
    fireEvent.keyDown(button, {
      code: "ArrowUp",
      key: "ArrowUp",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+Up");
  });

  it("records bare Pause (modifier-free is valid for this key)", () => {
    const { button, onChange } = arm();
    fireEvent.keyDown(button, { code: "Pause", key: "Pause" });
    expect(onChange).toHaveBeenCalledWith("Pause");
  });

  it("refuses an unsupported key with text and leaves recording mode", () => {
    const { button, onChange, getByRole } = arm("Ctrl+Shift+P");
    // Ctrl+Shift+; — punctuation is layout-dependent, so the recorder does not bind it.
    fireEvent.keyDown(button, { code: "Semicolon", key: ";", ctrlKey: true, shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(getByRole("alert")).toHaveTextContent(m.settings_hotkey_key_unsupported());
    // Same exit as the reserved/duplicate refusals: the button shows the kept value again.
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });

  it("a lone modifier is the start of a combo: no refusal, still armed", () => {
    const { button, onChange, queryByRole } = arm();
    fireEvent.keyDown(button, { code: "ShiftLeft", key: "Shift", shiftKey: true });
    fireEvent.keyDown(button, { code: "ControlLeft", key: "Control", ctrlKey: true, shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByRole("alert")).toBeNull();
    expect(button).toHaveTextContent(m.settings_hotkey_press_keys());
  });

  it("Tab leaves recording mode silently and lets focus move on", () => {
    const { button, onChange, queryByRole } = arm("Ctrl+Shift+P");
    // fireEvent returns false when a handler called preventDefault(): a swallowed
    // Tab would trap a keyboard user inside the armed field.
    const notPrevented = fireEvent.keyDown(button, { code: "Tab", key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByRole("alert")).toBeNull();
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });

  it("Ctrl+Tab is an attempt, not navigation: refused like any unbindable key", () => {
    const { button, onChange, getByRole } = arm("Ctrl+Shift+P");
    fireEvent.keyDown(button, { code: "Tab", key: "Tab", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(getByRole("alert")).toHaveTextContent(m.settings_hotkey_key_unsupported());
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });

  it("Shift+Tab is the same exit in the other direction", () => {
    const { button, onChange, queryByRole } = arm("Ctrl+Shift+P");
    const notPrevented = fireEvent.keyDown(button, { code: "Tab", key: "Tab", shiftKey: true });
    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByRole("alert")).toBeNull();
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });

  it("losing focus disarms the recorder instead of leaving it waiting", () => {
    const { button, onChange, queryByRole } = arm("Ctrl+Shift+P");
    fireEvent.blur(button);
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByRole("alert")).toBeNull();
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });

  it("a refusal on Enter survives the key release", () => {
    // react-aria fires onPress on the keyup of Enter/Space; without a guard that
    // release would re-arm the field and wipe the alert the keydown just raised.
    const { button, getByRole } = arm("Ctrl+Shift+P");
    fireEvent.keyDown(button, { code: "Enter", key: "Enter" });
    fireEvent.keyUp(button, { code: "Enter", key: "Enter" });
    expect(getByRole("alert")).toHaveTextContent(m.settings_hotkey_key_unsupported());
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });

  it("recording Ctrl+Space does not re-arm on the Space release", () => {
    const { button, onChange } = arm();
    fireEvent.keyDown(button, { code: "Space", key: " ", ctrlKey: true });
    fireEvent.keyUp(button, { code: "Space", key: " ", ctrlKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Ctrl+Space");
    expect(button).not.toHaveTextContent(m.settings_hotkey_press_keys());
  });

  it("the spent release does not eat the next activation", () => {
    const { button } = arm("Ctrl+Shift+P");
    fireEvent.keyDown(button, { code: "Enter", key: "Enter" });
    fireEvent.keyUp(button, { code: "Enter", key: "Enter" });
    fireEvent.click(button);
    expect(button).toHaveTextContent(m.settings_hotkey_press_keys());
  });

  it("losing focus between press and release forgets the spent mark", () => {
    // The release lands on another element, so no onPress ever spends the mark;
    // a stale mark would swallow the next click on this button.
    const { button } = arm("Ctrl+Shift+P");
    fireEvent.keyDown(button, { code: "Enter", key: "Enter" });
    fireEvent.blur(button);
    // The physical release happens wherever focus went — react-aria sees it on
    // its document-level keyup listener and does not count it as a press here.
    fireEvent.keyUp(document.body, { code: "Enter", key: "Enter" });
    fireEvent.click(button);
    expect(button).toHaveTextContent(m.settings_hotkey_press_keys());
  });

  it("cancels recording on Escape without recording a combo", () => {
    const { button, onChange } = arm("Ctrl+Shift+P");
    fireEvent.keyDown(button, { code: "Escape", key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    // Recording exited → button shows the existing value again.
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });
});

describe("KeyRecorder — accessible names", () => {
  it("names the clear button after its action so SR users can tell rows apart", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <KeyRecorder label={LABEL} value="Ctrl+Shift+R" onChange={onChange} />,
    );
    const clear = getByRole("button", {
      name: m.settings_hotkey_clear({ action: LABEL }),
    });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("announces an unassigned combo as 'not set', not as the clear action", () => {
    const { getByRole } = render(
      <KeyRecorder label={LABEL} value="" onChange={vi.fn()} />,
    );
    expect(
      getByRole("button", {
        name: `${LABEL}: ${m.settings_hotkey_not_set()}. ${m.settings_hotkey_press_to_change()}`,
      }),
    ).toBeInTheDocument();
  });
});
