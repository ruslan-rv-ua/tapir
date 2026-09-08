import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { LiveBadge } from "./LiveBadge";
import { RecordingBadge } from "./RecordingBadge";

/**
 * The badge names the kind of source, and must not look like the recording
 * indicator while doing it. Red and pulsation are the two signals
 * `docs/accessibility.md` reserves for "a recording is running", and
 * `StreamItem` spends both on exactly that. This is a look-only guard, which is
 * why it reads class names: nothing in the accessible output changed with the
 * repaint, so an assertion on role or text would pass over the regression it is
 * meant to catch.
 *
 * The last case is the reason the whole thing exists — the two badges answer one
 * question ("station on air or a file?"), so what must stay true is that they
 * carry no motion between them.
 */
describe("LiveBadge — a source mark, not a recording indicator", () => {
  it("keeps the word and the label a screen reader gets", () => {
    const { getByLabelText } = render(<LiveBadge />);

    expect(getByLabelText(m.live_stream())).toHaveTextContent(m.live_stream_short());
  });

  it("borrows neither the red nor the pulse of a running recording", () => {
    const { getByLabelText } = render(<LiveBadge />);
    const markup = getByLabelText(m.live_stream()).outerHTML;

    expect(markup, "red belongs to the recording state").not.toMatch(/red-\d/u);
    expect(markup, "pulsation belongs to the recording state").not.toMatch(/animate-/u);
  });

  it("is as still as the file badge it shares an axis with", () => {
    const live = render(<LiveBadge />).getByLabelText(m.live_stream()).outerHTML;
    const file = render(<RecordingBadge />).getByText(m.player_recording_badge()).outerHTML;

    expect([live, file].every((markup) => !/animate-/u.test(markup))).toBe(true);
  });
});
