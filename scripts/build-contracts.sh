#!/usr/bin/env bash
# Builds settled.wasm and mock_ft.wasm with the pinned toolchain (rust-toolchain.toml).
#
# The prebuilt Rust std for wasm32 uses encodings (sign-extension ops, multi-byte table
# immediates) that the NEAR runtime's parser rejects. Like cargo-near, re-encode the output
# with binaryen's wasm-opt and lower sign-extension ops. Needs `wasm-opt` on PATH
# (Ubuntu: apt-get install binaryen).
set -euo pipefail
cd "$(dirname "$0")/.."
RUSTFLAGS="-C link-arg=-s -C target-cpu=mvp" \
  cargo build --release --target wasm32-unknown-unknown -p settled -p mock-ft
OUT=target/wasm32-unknown-unknown/release
for name in settled mock_ft; do
  wasm-opt -Oz --enable-sign-ext --enable-mutable-globals --signext-lowering \
    --strip-debug --strip-target-features \
    "$OUT/$name.wasm" -o "$OUT/$name.wasm"
  # Fails the build if any non-MVP instruction is left.
  wasm-opt --mvp-features --quiet "$OUT/$name.wasm" -o /dev/null
done
ls -l "$OUT"/*.wasm
