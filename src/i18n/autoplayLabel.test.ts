import { expect, it } from "vitest";
import en from "./messages/en.json";
import uk from "./messages/uk.json";

/**
 * The startup checkbox and the field right under it must open with the same word.
 *
 * `profile_autoplay_label` and `settings_resume_file_from` stand one above the
 * other on the profile's "Playback" tab and describe halves of a single cold-start
 * decision: whether to bring the last source back, and — for a file — from where.
 * A label that promises "something starts playing" instead of "the last one comes
 * back" breaks that pair, and the two locales then describe different features
 * (uk once said «Автовідтворення при запуску» while en said "Resume last playback
 * on startup").
 *
 * Guarded over the JSON rather than through `m.*()`: paraglide compiles one locale
 * per run, and the drift lived in exactly one of them.
 *
 * What is pinned is the pair, not the wording: whatever verb the resume-file field
 * opens with, the checkbox above it repeats it *verbatim*, so an inflected rewrite
 * («Відновлення…») has to be carried to both labels — that is the point of the
 * guard, not an accident of it. What no string test can pin is **which** thing
 * comes back: «Відновлювати гучність при запуску» would pass here. That half is
 * held by prose — `profile_autoplay_hint` beside the checkbox, and CONTEXT.md
 * §«Автозапуск, автовідтворення, автоперехід».
 */
const PAIRS = {
  uk: { autoplay: uk.profile_autoplay_label, resumeFile: uk.settings_resume_file_from },
  en: { autoplay: en.profile_autoplay_label, resumeFile: en.settings_resume_file_from },
};

/** "Resume last playback on startup" → "resume" */
const firstWord = (label: string) => label.trim().split(/\s+/)[0].toLowerCase();

it.each(Object.entries(PAIRS))(
  "%s: the startup checkbox opens with the same word as the resume-file field",
  (_locale, { autoplay, resumeFile }) => {
    expect(firstWord(autoplay), `«${autoplay}» must read in pair with «${resumeFile}»`)
      .toBe(firstWord(resumeFile));
  },
);
