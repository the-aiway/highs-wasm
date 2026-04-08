#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HIGHS_DIR="$ROOT_DIR/HiGHS"
BUILD_DIR="$ROOT_DIR/build/native"
DIST_DIR="$ROOT_DIR/dist"

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalize arch names
if [[ "$ARCH" == "aarch64" ]]; then
  ARCH="arm64"
elif [[ "$ARCH" == "x86_64" ]]; then
  ARCH="x64"
fi

mkdir -p "$BUILD_DIR" "$DIST_DIR"

echo "==> Configuring HiGHS (native) for $PLATFORM-$ARCH..."

# Use portable CPU count
if command -v nproc &> /dev/null; then
  NPROC=$(nproc)
elif command -v sysctl &> /dev/null; then
  NPROC=$(sysctl -n hw.ncpu)
else
  NPROC=4
fi

cmake -S "$HIGHS_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TESTING=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_SHARED_LIBS=ON

echo "==> Building HiGHS with $NPROC threads..."
make -C "$BUILD_DIR" -j$NPROC

echo "==> Copying library..."
if [[ "$PLATFORM" == "darwin" ]]; then
  EXT="dylib"
  SRC_LIB="$BUILD_DIR/lib/libhighs.$EXT"
else
  EXT="so"
  SRC_LIB="$BUILD_DIR/lib/libhighs.$EXT"
fi

DEST_LIB="$DIST_DIR/libhighs-$PLATFORM-$ARCH.$EXT"
cp "$SRC_LIB" "$DEST_LIB"

# Also copy as generic name for backwards compatibility
cp "$SRC_LIB" "$DIST_DIR/libhighs.$EXT"

echo "==> Native build complete: $DEST_LIB"
ls -la "$DIST_DIR"/libhighs*
