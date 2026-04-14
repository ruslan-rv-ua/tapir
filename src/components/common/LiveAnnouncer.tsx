import { useStore } from "@nanostores/react";
import { $announcer } from "../../stores/announcer";
import { useEffect, useRef } from "react";

export function LiveAnnouncer() {
  const announcement = useStore($announcer);
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!announcement?.message) return;
    const ref = announcement.priority === "assertive" ? assertiveRef : politeRef;
    if (ref.current) {
      ref.current.textContent = "";
      requestAnimationFrame(() => {
        if (ref.current) ref.current.textContent = announcement.message;
      });
    }
  }, [announcement]);

  return (
    <>
      <div ref={politeRef} aria-live="polite" aria-atomic="true" className="sr-only" />
      <div ref={assertiveRef} aria-live="assertive" aria-atomic="true" className="sr-only" />
    </>
  );
}
