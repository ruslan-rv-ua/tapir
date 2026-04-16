import { useState, useCallback } from "react";
import { Button, Label } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  label: string;
  value: string;
  onChange: (combo: string) => void;
  onValidate?: (combo: string) => string | null;
}

export function KeyRecorder({ label, value, onChange, onValidate }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setIsRecording(false);
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Super");

      const key = e.key;
      if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
        const normalized =
          key === " "
            ? "Space"
            : key === "ArrowUp"
            ? "Up"
            : key === "ArrowDown"
              ? "Down"
              : key === "ArrowLeft"
                ? "Left"
                : key === "ArrowRight"
                  ? "Right"
                  : key.length === 1
                    ? key.toUpperCase()
                    : key;
        parts.push(normalized);

        const combo = parts.join("+");
        const validationError = onValidate?.(combo);
        if (validationError) {
          setError(validationError);
        } else {
          setError(null);
          onChange(combo);
        }
        setIsRecording(false);
      }
    },
    [isRecording, onChange, onValidate],
  );

  const handleClear = () => {
    setError(null);
    onChange("");
  };

  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <Label className="w-48 text-sm text-slate-300">{label}</Label>
      <Button
        aria-label={
          isRecording
            ? m.settings_hotkey_press_keys()
            : `${label}: ${value || m.settings_hotkey_clear()}. ${m.settings_hotkey_press_to_change()}`
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
        aria-label={m.settings_hotkey_clear()}
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
