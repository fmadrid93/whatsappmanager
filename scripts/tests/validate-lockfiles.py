#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--require", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
errors = []
for folder in ("backend", "frontend"):
    package = root / folder / "package.json"
    lock = root / folder / "package-lock.json"
    if not package.exists():
        errors.append(f"Falta {folder}/package.json")
        continue
    if not lock.exists():
        if args.require:
            errors.append(f"Falta {folder}/package-lock.json; ejecuta install-dependencies.ps1")
        else:
            print(f"WARN {folder}/package-lock.json no incluido en el paquete fuente")
        continue
    package_data = json.loads(package.read_text(encoding="utf-8-sig"))
    lock_data = json.loads(lock.read_text(encoding="utf-8-sig"))
    root_lock = lock_data.get("packages", {}).get("", {})
    if package_data.get("name") != root_lock.get("name"):
        errors.append(f"Nombre inconsistente en {folder}/package-lock.json")
    if package_data.get("version") != root_lock.get("version"):
        errors.append(f"Versión inconsistente en {folder}/package-lock.json")
if errors:
    for error in errors:
        print(f"ERROR {error}")
    raise SystemExit(1)
print("PASS lockfiles")
