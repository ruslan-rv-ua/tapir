import { useCallback } from "react";
import { $announcer } from "../stores/announcer";

export function useAnnounce(): (message: string, priority?: "polite" | "assertive") => void {
  return useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    $announcer.set({ message, priority });
  }, []);
}
