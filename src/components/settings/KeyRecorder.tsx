import { useState, useCallback } from "react";
import { Button, Label } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  label: string;
  value: string;
  onChange: (combo: string) => void;
  onValidate?: (combo: string) => string | null;
}

/**
 * Map a KeyboardEvent.code (physical key position) to an accelerator token.
 * Uses `code`, not `key`, so recording is layout-independent (accessibility.md
 * §12): physical R is always `KeyR` → "R", even on a Cyrillic layout where
 * `key` would be "к". Returns null for keys we don't bind (punctuation, numpad,
 * lone modifiers) so the recorder stays armed instead of storing a combo the OS
 * can't register.
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

export function KeyRecorder({ label, value, onChange, onValidate }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        setIsRecording(false);
        return;
      }

      // Ignore lone modifiers / unbindable keys → stay armed for a real combo.
      const token = codeToToken(e.code);
      if (!token) return;

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
            : `${label}: ${value || m.settings_hotkey_not_set()}. ${m.settings_hotkey_press_to_change()}`
        }
        onPress={() => {
          setIsRecording(true);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
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
      {error && (
        <span role="alert" className="text-xs text-red-400 forced-colors:text-[CanvasText]">
          {error}
        </span>
      )}
    </div>
  );
}
