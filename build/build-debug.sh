#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HIGHS_DIR="$ROOT_DIR/HiGHS"
BUILD_DIR="$ROOT_DIR/build/debug"
DIST_DIR="$ROOT_DIR/dist"

mkdir -p "$BUILD_DIR" "$DIST_DIR"

echo "==> Configuring HiGHS (debug)..."
emcmake cmake -S "$HIGHS_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Debug \
  -DBUILD_TESTING=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DHIGHS_NO_DEFAULT_THREADS=ON

echo "==> Building HiGHS..."
emmake make -C "$BUILD_DIR" -j$(sysctl -n hw.ncpu)

echo "==> Linking wasm module (debug)..."
emcc "$BUILD_DIR/lib/libhighs.a" -o "$DIST_DIR/highs.debug.mjs" \
  -O0 -g \
  -fwasm-exceptions \
  -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=4194304 \
  -sINITIAL_MEMORY=33554432 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sSINGLE_FILE=1 \
  -sASSERTIONS=2 \
  -sSAFE_HEAP=1 \
  -sSTACK_OVERFLOW_CHECK=2 \
  -sEXPORTED_FUNCTIONS=@"$SCRIPT_DIR/exported_functions.json" \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue","stringToUTF8","UTF8ToString","lengthBytesUTF8","HEAP8","HEAPU8","HEAP16","HEAPU16","HEAP32","HEAPU32","HEAPF32","HEAPF64","FS","addFunction","removeFunction"]' \
  -sALLOW_TABLE_GROWTH=1 \
  -sENVIRONMENT='web,worker' \
  -sNO_EXIT_RUNTIME=1 \
  -sFILESYSTEM=1

echo "==> Debug build complete: $DIST_DIR/highs.debug.mjs"
