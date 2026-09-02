import { useState, useCallback, useRef } from "react";
import { Button, Label } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  label: string;
  value: string;
  onChange: (combo: string) => void;
  onValidate?: (combo: string) => string | null;
  /**
   * Зайнята комбінація (CONTEXT.md): ОС не віддала її Tapir, бо її тримає інша
   * програма — гаряча клавіша призначена, але не працює. Стан, не подія: видимий
   * носій на рядку плюс та сама фраза в імені кнопки, без role="alert".
   */
  busy?: boolean;
}

/**
 * Map a KeyboardEvent.code (physical key position) to an accelerator token.
 * Uses `code`, not `key`, so recording is layout-independent (accessibility.md
 * §12): physical R is always `KeyR` → "R", even on a Cyrillic layout where
 * `key` would be "к". Returns null for keys we don't bind (punctuation, numpad,
 * Enter…): the OS-level parser would take most of them, but they are layout- or
 * NumLock-dependent, so the recorder refuses them out loud. Lone modifiers never
 * reach this function — `isModifierCode` filters them first.
 */
function codeToToken(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  switch (code) {
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    case "Space":
      return "Space";
    // Semantically ideal for playback and conflict-free system-wide (absent on
    // compact keyboards, hence never a default). global-hotkey parses "PAUSE".
    case "Pause":
      return "Pause";
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return null;
}

/** A modifier on its own (`ControlLeft`, `ShiftRight`, …) — the first half of every combo, never a combo. */
function isModifierCode(code: string): boolean {
  return /^(Control|Shift|Alt|Meta|OS)(Left|Right)$/.test(code);
}

export function KeyRecorder({ label, value, onChange, onValidate, busy = false }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // react-aria fires onPress on the *keyup* of Enter/Space — after the keydown
  // handler below has already finished the recording. Unguarded, that release
  // re-arms the field and wipes the refusal the keydown just raised.
  const consumedPressRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRecording) return;

      // Bare Tab / Shift+Tab is navigation, not an attempt: leave recording mode
      // and let the browser move focus — no preventDefault, no message. With
      // Ctrl/Alt it is an attempt at a combo and falls through to the refusal.
      if (e.code === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setIsRecording(false);
        return;
      }

      // No stopPropagation: react-aria's useKeyboard already stops the bubble by
      // default (continuePropagation() opts out), and calling it here only logs
      // a console error in dev.
      e.preventDefault();

      // This key's release will reach onPress as a press: mark it spent. The
      // test mirrors react-aria's own (key for Enter, so NumpadEnter counts too;
      // code for Space, which is layout-independent).
      if (e.key === "Enter" || e.code === "Space") consumedPressRef.current = true;

      if (e.code === "Escape") {
        setIsRecording(false);
        return;
      }

      // A lone modifier is the first half of every combo: stay armed, say nothing.
      if (isModifierCode(e.code)) return;

      const token = codeToToken(e.code);
      if (!token) {
        // Unbindable key: refuse out loud and leave recording mode, exactly like
        // the reserved/duplicate refusals below — silence here reads as a hang.
        setError(m.settings_hotkey_key_unsupported());
        setIsRecording(false);
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Super");
      parts.push(token);

      const combo = parts.join("+");
      const validationError = onValidate?.(combo);
      if (validationError) {
        setError(validationError);
      } else {
        setError(null);
        onChange(combo);
      }
      setIsRecording(false);
    },
    [isRecording, onChange, onValidate],
  );

  const handleClear = () => {
    setError(null);
    onChange("");
  };

  return (
    <div className="flex items-center gap-3">
      <Label className="w-48 text-sm text-slate-300">{label}</Label>
      <Button
        aria-label={
          isRecording
            ? m.settings_hotkey_press_keys()
            : `${label}: ${value || m.settings_hotkey_not_set()}${busy ? `, ${m.settings_hotkey_busy()}` : ""}. ${m.settings_hotkey_press_to_change()}`
        }
        onPress={() => {
          if (consumedPressRef.current) {
            consumedPressRef.current = false;
            return;
          }
          setIsRecording(true);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        // An armed field that lost focus would keep saying "press keys" to no one.
        onBlur={() => {
          // The release now lands elsewhere, so no onPress will spend the mark.
          consumedPressRef.current = false;
          setIsRecording(false);
        }}
        className="min-w-36 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:ring-[Highlight]"
      >
        {isRecording ? m.settings_hotkey_press_keys() : value || "—"}
      </Button>
      <Button
        aria-label={m.settings_hotkey_clear({ action: label })}
        onPress={handleClear}
        className="rounded border border-slate-600 bg-slate-700 px-2 py-2 text-sm text-slate-400 hover:text-slate-200 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus:ring-[Highlight]"
      >
        ✕
      </Button>
      {busy && (
        <span className="text-xs text-amber-300 forced-colors:text-[CanvasText]">
          {m.settings_hotkey_busy()}
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-400 forced-colors:text-[CanvasText]">
          {error}
        </span>
      )}
    </div>
  );
}
