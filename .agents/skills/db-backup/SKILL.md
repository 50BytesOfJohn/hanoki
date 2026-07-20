---
name: db-backup
description: Backup Hanoki app SQLite to ~/Documents/hanoki/backup. Use when user asks to backup DB, dump sqlite, or mentions /db-backup.
allowed-tools: Bash
---

# DB Backup

```bash
SRC="$HOME/Library/Application Support/com.hanoki.app/data-dev/app.sqlite"
DEST="$HOME/Documents/hanoki/backup/app.sqlite.$(date +%Y-%m-%d_%H-%M-%S)"
mkdir -p "$(dirname "$DEST")"
sqlite3 "$SRC" ".backup '$DEST'"
ls -lah "$DEST"
```

Report the backup path. Do not commit it.
