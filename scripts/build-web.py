"""Build the dependency-free Rust WASM adapter into the static demo directory."""
from pathlib import Path
import shutil
import subprocess

root=Path(__file__).resolve().parents[1]
subprocess.run(["cargo","build","--locked","--release","--target","wasm32-unknown-unknown"],cwd=root,check=True)
shutil.copyfile(root/"target/wasm32-unknown-unknown/release/tinyik.wasm",root/"web/tinyik-rust.wasm")
print("Rust WASM built. Serve web/ with python -m http.server --directory web 8080")
