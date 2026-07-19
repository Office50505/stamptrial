#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_DIR="${STAMPTRIAL_BACKUP_DIR:-$HOME/stamptrial-backups/mongodb}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "Missing MONGODB_URI. Add it to $ENV_FILE or export it before running." >&2
  exit 1
fi

DB_NAME="${MONGODB_DB_NAME:-stamptrial}"

if ! command -v mongodump >/dev/null 2>&1; then
  cat >&2 <<'EOF'
mongodump is not installed.

Install MongoDB Database Tools on macOS with:
  brew tap mongodb/brew
  brew install mongodb-database-tools

Then run:
  npm run backup:mongodb
EOF
  exit 127
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +"%Y-%m-%d-%H%M%S")"
ARCHIVE="$BACKUP_DIR/$DB_NAME-$TIMESTAMP.archive.gz"

echo "Creating MongoDB backup for database '$DB_NAME'..."
echo "Backup path: $ARCHIVE"

mongodump \
  --uri="$MONGODB_URI" \
  --db="$DB_NAME" \
  --archive="$ARCHIVE" \
  --gzip

if [[ ! -s "$ARCHIVE" ]]; then
  echo "Backup failed: archive was not created or is empty." >&2
  exit 1
fi

shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

echo "Backup complete."
echo "Archive: $ARCHIVE"
echo "Checksum: $ARCHIVE.sha256"
