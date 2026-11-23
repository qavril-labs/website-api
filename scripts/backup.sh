#!/usr/bin/env bash
# Nightly logical backup of the website database (leads and content) to S3.
# Needs pg_dump (PostgreSQL 18 client), the aws CLI, and these environment variables:
#   BACKUP_URL     read-only backup role connection string
#   BACKUP_BUCKET  e.g. qavril-backups-prod-qv7k2
#   SERVICE        website-api
# schema_migrations is excluded: the backup role has no rights on it, and it holds no content.
set -euo pipefail

: "${BACKUP_URL:?set BACKUP_URL}"
: "${BACKUP_BUCKET:?set BACKUP_BUCKET}"
: "${SERVICE:?set SERVICE}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="/tmp/${SERVICE}-${stamp}.dump"

pg_dump --format=custom --no-owner --no-acl --schema=public --exclude-table=public.schema_migrations \
  --file "$file" "$BACKUP_URL"

aws s3 cp "$file" "s3://${BACKUP_BUCKET}/${SERVICE}/${stamp}.dump" --sse AES256 --only-show-errors
rm -f "$file"
echo "backed up ${SERVICE} to s3://${BACKUP_BUCKET}/${SERVICE}/${stamp}.dump"
