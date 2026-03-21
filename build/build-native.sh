#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HIGHS_DIR="$ROOT_DIR/HiGHS"
BUILD_DIR="$ROOT_DIR/build/native"
DIST_DIR="$ROOT_DIR/dist"

mkdir -p "$BUILD_DIR" "$DIST_DIR"

echo "==> Configuring HiGHS (native)..."
cmake -S "$HIGHS_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TESTING=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_SHARED_LIBS=ON

echo "==> Building HiGHS..."
make -C "$BUILD_DIR" -j$(sysctl -n hw.ncpu)

echo "==> Copying library..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  cp "$BUILD_DIR/lib/libhighs.dylib" "$DIST_DIR/"
  # Also create versioned symlinks if needed
  ls -la "$BUILD_DIR/lib/"
else
  cp "$BUILD_DIR/lib/libhighs.so" "$DIST_DIR/"
fi

echo "==> Native build complete: $DIST_DIR/libhighs.*"
