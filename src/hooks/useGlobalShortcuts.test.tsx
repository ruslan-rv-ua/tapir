import { useEffect, useRef, type ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import { $activeSection, $commandPaletteOpen } from "../stores/navigation";
import { $showAddStreamDialog } from "../stores/streams";
import { $showCreateProfileDialog } from "../stores/profileManager";
import { $showAddPatternDialog } from "../stores/wishlist";
import { $showAddScheduleDialog } from "../stores/schedule";
import { $settings, $settingsDialogOpen, $profileSettingsTarget } from "../stores/settings";

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
  $showCreateProfileDialog.set(false);
  $showAddPatternDialog.set(false);
  $showAddScheduleDialog.set(false);
  $settingsDialogOpen.set(false);
  $profileSettingsTarget.set(null);
  $settings.set({ activeProfile: "Jazz" } as never);
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

  // Дві комбінації на одній фізичній клавіші — регресія межі глобальне/профільне.
  it("opens the profile-settings dialog on Ctrl+Shift+, and leaves app settings shut", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true, shiftKey: true });
    expect($profileSettingsTarget.get()).toBe("Jazz");
    expect($settingsDialogOpen.get()).toBe(false);
  });

  it("opens app settings on Ctrl+, and leaves the profile dialog shut", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true });
    expect($settingsDialogOpen.get()).toBe(true);
    expect($profileSettingsTarget.get()).toBeNull();
  });

  // Toggle-скидання стора. У застосунку його дає Escape: щойно діалог
  // відкрито, фокус усередині модалки, а `isInModal()` глушить глобальні
  // комбінації — те саме обмеження, що й у наявного `Ctrl+,`.
  it("a second Ctrl+Shift+, from outside a modal clears the target", () => {
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(screen.getByTestId("field"), { code: "Comma", ctrlKey: true, shiftKey: true });
    expect($profileSettingsTarget.get()).toBeNull();
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

  it("opens Create Profile on Ctrl+N on the profiles section, not Add Stream", () => {
    $activeSection.set("profiles");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showCreateProfileDialog.get()).toBe(true);
    expect($showAddStreamDialog.get()).toBe(false);
  });

  it("opens Add Pattern on Ctrl+N on the wishlist section, not Add Stream", () => {
    $activeSection.set("wishlist");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddPatternDialog.get()).toBe(true);
    expect($showAddStreamDialog.get()).toBe(false);
  });

  it("opens Create Schedule on Ctrl+N on the schedule section, not Add Stream", () => {
    $activeSection.set("schedule");
    render(
      <Harness>
        <input data-testid="field" />
      </Harness>,
    );
    act(() => screen.getByTestId("field").focus());
    fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
    expect($showAddScheduleDialog.get()).toBe(true);
    expect($showAddStreamDialog.get()).toBe(false);
  });
});
