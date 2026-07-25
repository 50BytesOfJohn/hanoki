---
name: buffer
description: Use Buffer through its official CLI to inspect channels and posts or create, schedule, edit, and delete social posts. Use for any Buffer publishing or scheduling task.
---

# Buffer

- Run the CLI through `./.agents/skills/buffer/scripts/buffer-cli` from the repository root.
- Use the CLI's `--help` for the current commands and options; do not guess them or duplicate its documentation.
- Prefer JSON output for agent-readable results and use `--dry-run` before mutations when supported.
- Show the user the exact channel, content, and timing for approval before publishing or scheduling.
- On Buffer's free plan, keep at most 10 scheduled posts per channel. Check the existing queue before adding posts and report when it is full.
