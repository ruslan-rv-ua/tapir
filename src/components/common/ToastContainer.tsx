import { useStore } from "@nanostores/react";
import { $toasts, removeToast } from "../../stores/toasts";

export function ToastContainer() {
  const toasts = useStore($toasts);

  return (
    <div
      className="fixed bottom-20 right-4 z-50 flex flex-col gap-2"
      role="log"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 rounded px-3 py-2 text-sm shadow-lg ${
            toast.type === "error" ? "bg-red-700 text-white" :
            toast.type === "warning" ? "bg-amber-600 text-white" :
            toast.type === "success" ? "bg-green-700 text-white" :
            "bg-slate-700 text-slate-100"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            aria-label={`Dismiss: ${toast.message}`}
            className="ml-auto text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
