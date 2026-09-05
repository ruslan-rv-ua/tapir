See [AGENTS.md](AGENTS.md) for project context, architecture, conventions, and build commands.

When grilling, ask one question at a time.

Bash tool commands on this Windows setup are truncated somewhere between 6 and 8 KB. The
symptom is `unexpected EOF while looking for matching` pointing at the command's **last** line
(it is not a quoting problem — apostrophes inside `<<'EOF'` are fine). Anything longer than
~6 KB (~4 000 Cyrillic characters) goes through the Write tool, not a heredoc; scripts go to
the scratchpad as files and run from there.
