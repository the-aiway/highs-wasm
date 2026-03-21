#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HIGHS_DIR="$ROOT_DIR/HiGHS"
DIST_DIR="$ROOT_DIR/dist"

# Target: linux-x64, linux-arm64, darwin-x64, darwin-arm64
TARGET="${1:-linux-x64}"

case "$TARGET" in
  linux-x64)
    ZIG_TARGET="x86_64-linux-gnu"
    EXT="so"
    ;;
  linux-arm64)
    ZIG_TARGET="aarch64-linux-gnu"
    EXT="so"
    ;;
  darwin-x64)
    ZIG_TARGET="x86_64-macos"
    EXT="dylib"
    ;;
  darwin-arm64)
    ZIG_TARGET="aarch64-macos"
    EXT="dylib"
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Usage: $0 [linux-x64|linux-arm64|darwin-x64|darwin-arm64]"
    exit 1
    ;;
esac

BUILD_DIR="$ROOT_DIR/build/native-$TARGET"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

# Create zig wrapper scripts
ZIG_CC="$BUILD_DIR/zig-cc"
ZIG_CXX="$BUILD_DIR/zig-cxx"

cat > "$ZIG_CC" << EOF
#!/bin/bash
exec zig cc -target $ZIG_TARGET "\$@"
EOF
chmod +x "$ZIG_CC"

cat > "$ZIG_CXX" << EOF
#!/bin/bash
exec zig c++ -target $ZIG_TARGET "\$@"
EOF
chmod +x "$ZIG_CXX"

echo "==> Cross-compiling HiGHS for $TARGET (zig target: $ZIG_TARGET)..."

cmake -S "$HIGHS_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER="$ZIG_CC" \
  -DCMAKE_CXX_COMPILER="$ZIG_CXX" \
  -DCMAKE_SYSTEM_NAME="$(echo $TARGET | cut -d- -f1 | sed 's/linux/Linux/;s/darwin/Darwin/')" \
  -DCMAKE_SYSTEM_PROCESSOR="$(echo $TARGET | cut -d- -f2 | sed 's/x64/x86_64/;s/arm64/aarch64/')" \
  -DBUILD_TESTING=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_SHARED_LIBS=ON \
  -DHIGHS_ENABLE_IPO=OFF

echo "==> Building..."
make -C "$BUILD_DIR" -j$(sysctl -n hw.ncpu 2>/dev/null || nproc)

DEST_LIB="$DIST_DIR/libhighs-$TARGET.$EXT"
cp "$BUILD_DIR/lib/libhighs.$EXT" "$DEST_LIB"

echo "==> Cross-compile complete: $DEST_LIB"
ls -la "$DEST_LIB"
