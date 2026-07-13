#!/usr/bin/env bash
set -euo pipefail

: "${OLD_MONGODB_URI:?Set OLD_MONGODB_URI to the previous Atlas connection string}"
: "${MONGODB_URI:?Set MONGODB_URI to the new Atlas connection string}"

export SOURCE_MONGODB_URI="$OLD_MONGODB_URI"
export SOURCE_MONGODB_DB_NAME="${SOURCE_MONGODB_DB_NAME:-stamptrial}"
export TARGET_MONGODB_DB_NAME="${TARGET_MONGODB_DB_NAME:-stamptrial}"

echo "Dry-run: checking designs to copy from old DB to new DB..."
npm run copy:designs-from-old-db

echo
echo "Apply: copying missing designs to new DB with compact image suffixes..."
npm run copy:designs-from-old-db -- --apply

echo
echo "Verify: checking if any full design CDN URLs remain in the new DB..."
npm run migrate:design-url-suffixes
