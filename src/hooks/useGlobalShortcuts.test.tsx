import { useEffect, useRef, type ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import { $activeSection, $commandPaletteOpen } from "../stores/navigation";
import { $showAddStreamDialog } from "../stores/streams";

function Harness({ children }: { children?: ReactNode }) {
  useGlobalShortcuts();
  return <>{children}</>;
}

// A field that swallows keydown in the BUBBLE phase via a native listener —
// reproduces react-aria's SearchField, which is why the old bubble-phase global
// listener missed Alt+digit/Ctrl+K while such a field was focused. A capture-
// phase global listener must still win.
function SwallowingField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const stop = (e: KeyboardEvent) => e.stopPropagation();
    el.addEventListener("keydown", stop);
    return () => el.removeEventListener("keydown", stop);
  }, []);
  return <input data-testid="field" ref={ref} />;
}

beforeEach(() => {
  $activeSection.set("browser");
  $commandPaletteOpen.set(false);
  $showAddStreamDialog.set(false);
});

describe("useGlobalShortcuts", () => {
  it("switches section on Alt+digit even when the focused field swallows bubbling keydown", () => {
    render(
      <Harness>
        <SwallowingField />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Digit1", altKey: true });
    expect($activeSection.get()).toBe("streams");
  });

  it("opens the command palette on Ctrl+K from a swallowing field", () => {
    render(
      <Harness>
        <SwallowingField />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyK", ctrlKey: true });
    expect($commandPaletteOpen.get()).toBe(true);
  });

  it("does nothing while focus is inside a modal", () => {
    render(
      <Harness>
        <div role="dialog">
          <input data-testid="field" />
        </div>
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Digit1", altKey: true });
    expect($activeSection.get()).toBe("browser");
  });

  it("ignores key auto-repeat", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Digit1", altKey: true, repeat: true });
    expect($activeSection.get()).toBe("browser");
  });

  it("opens Add Stream on Ctrl+N only on the streams section", () => {
    $activeSection.set("streams");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddStreamDialog.get()).toBe(true);
  });

  it("does not open Add Stream on Ctrl+N off the streams section", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddStreamDialog.get()).toBe(false);
  });
});
