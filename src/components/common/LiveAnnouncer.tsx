import { useStore } from "@nanostores/react";
import { $announcer } from "../../stores/announcer";
import { useEffect, useRef } from "react";

/**
 * How long an announced message stays in its log. Long enough for a braille
 * display or a busy speech queue to reach it, short enough that a session does
 * not accumulate its whole history of sr-only text in browse mode.
 */
const MESSAGE_TTL_MS = 7000;

export function LiveAnnouncer() {
  const announcement = useStore($announcer);
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!announcement?.message) return;
    const region = announcement.priority === "assertive" ? assertiveRef.current : politeRef.current;
    if (!region) return;

    // One fresh node per message — never a text swap on a single node. Swapping
    // (clear the region, re-set it on the next frame) is silent whenever a
    // message repeats the previous one: the browser batches both mutations into
    // one accessibility update, the region's net text comes out unchanged, and
    // NVDA has nothing to report. Autosave announcements are always the same
    // string, so every save after the first went unspoken. An appended node is
    // an addition no matter what it says. Same shape as
    // @react-aria/live-announcer.
    const node = document.createElement("div");
    node.textContent = announcement.message;
    region.appendChild(node);

    // Deliberately no cleanup on re-run: dropping the previous node the moment
    // the next one arrives would put a removal and an addition back into one
    // batch — the pairing that swallowed the announcement in the first place.
    // The timeout owns removal; the regions are React-owned, so unmount takes
    // whatever is left.
    setTimeout(() => node.remove(), MESSAGE_TTL_MS);
  }, [announcement]);

  return (
    <>
      {/* role="log" + aria-relevant="additions": every message is a new child
          and only additions are spoken. No aria-atomic — with a log it would
          make each announcement re-read the messages still sitting there.
          data-live-announcer keeps these regions out of react-aria's
          ariaHideOutside: without it, any open Modal aria-hides them and
          every announce() goes silent while a dialog is open. */}
      <div
        ref={politeRef}
        data-live-announcer="true"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        data-live-announcer="true"
        role="log"
        aria-live="assertive"
        aria-relevant="additions"
        className="sr-only"
      />
    </>
  );
}
