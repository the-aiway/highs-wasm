#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HIGHS_DIR="$ROOT_DIR/HiGHS"
BUILD_DIR="$ROOT_DIR/build/mt"
DIST_DIR="$ROOT_DIR/dist"

mkdir -p "$BUILD_DIR" "$DIST_DIR"

echo "==> Configuring HiGHS (multi-threaded)..."
emcmake cmake -S "$HIGHS_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TESTING=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DCMAKE_CXX_FLAGS="-fwasm-exceptions -pthread"

echo "==> Building HiGHS..."
emmake make -C "$BUILD_DIR" -j$(sysctl -n hw.ncpu)

echo "==> Linking wasm module (multi-threaded)..."
emcc "$BUILD_DIR/lib/libhighs.a" -o "$DIST_DIR/highs.mt.mjs" \
  -O3 -flto \
  -msimd128 \
  -fwasm-exceptions \
  -pthread \
  -sSHARED_MEMORY=1 \
  -sPTHREAD_POOL_SIZE='navigator.hardwareConcurrency' \
  -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=1048576 \
  -sINITIAL_MEMORY=16777216 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sSINGLE_FILE=1 \
  -sEXPORTED_FUNCTIONS=@"$SCRIPT_DIR/exported_functions.json" \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue","stringToUTF8","UTF8ToString","lengthBytesUTF8","HEAP8","HEAPU8","HEAP16","HEAPU16","HEAP32","HEAPU32","HEAPF32","HEAPF64","FS","addFunction","removeFunction"]' \
  -sALLOW_TABLE_GROWTH=1 \
  -sENVIRONMENT='web,worker' \
  -sNO_EXIT_RUNTIME=1 \
  -sFILESYSTEM=1

echo "==> MT build complete: $DIST_DIR/highs.mt.mjs"
