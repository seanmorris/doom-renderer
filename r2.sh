
#!/bin/bash
set -euo pipefail

BUCKET_NAME="level-archive"
SOURCE_DIR="./src/wads"
ENDPOINT="https://99e8c2ab2ab341b66e5d1b6b46d4536d.r2.cloudflarestorage.com"
PREFIX="s3://$BUCKET_NAME"

export AWS_SHARED_CREDENTIALS_FILE="$(dirname "$0")/.aws/credentials"
export AWS_CONFIG_FILE="$(dirname "$0")/.aws/config"

echo "▶ Scanning and uploading local .wad files..."
find "$SOURCE_DIR" -type f -iname '*.wad' -print0 | sort | xargs -0 -P 20 -I{} bash -c '
relative_path=$(realpath --relative-to="'"$SOURCE_DIR"'" "$1")
aws s3 cp "$1" "'"$PREFIX"'/$relative_path" \
	--endpoint-url="'"$ENDPOINT"'" \
	--profile r2
' _ {}

echo "▶ Scanning remote .wad files..."
mapfile -t remote_files < <(
aws s3 ls "$PREFIX" \
	--recursive \
	--endpoint-url="$ENDPOINT" \
	--profile r2 |
	awk '{print $4}' |
	grep -Ei '\.(wad|WAD)$'
)

echo "▶ Rebuilding local file list..."
mapfile -t local_relative_paths < <(
find "$SOURCE_DIR" -type f -iname '*.wad' -print0 |
xargs -0 -I{} realpath --relative-to="$SOURCE_DIR" "{}"
)
