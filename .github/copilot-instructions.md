### Continuity

NEVER yield a turn without `vscode_askQuestions`. Every turn ends with structured
options — at completion, block, discussion checkpoint, or any other stopping point.

- Offer 2–3 next steps + "Are we done for now?" + free-form input for steering
- "Are we done for now?" selected → terminate session
- Other selection or freeform input → treat as new objective, repeat
- Ambiguous/conflicting input → likely typo, clarify via vscode_askQuestions
- Cancelled input → likely accidental, re-present the question
- Cancelled tool execution → user spotted something, pause and ask what to adjust

Terminate without confirmation only if user explicitly says stop or a fatal error occurs.
