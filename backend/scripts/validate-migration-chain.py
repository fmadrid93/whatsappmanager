#!/usr/bin/env python3
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "prisma/schema.prisma"
MIGRATIONS = ROOT / "prisma/migrations"

schema_text = SCHEMA.read_text(encoding="utf-8")
models = re.findall(r"^model\s+(\w+)\s*\{", schema_text, flags=re.MULTILINE)
if not models:
    raise SystemExit("No se encontraron modelos Prisma.")

migration_dirs = sorted(path for path in MIGRATIONS.iterdir() if path.is_dir())
if not migration_dirs:
    raise SystemExit("No existe la baseline SQL Server. Ejecuta migrate-database.ps1.")

all_sql: list[str] = []
for directory in migration_dirs:
    sql_file = directory / "migration.sql"
    if not sql_file.exists() or not sql_file.read_text(encoding="utf-8").strip():
        raise SystemExit(f"Migración vacía o ausente: {directory.name}")
    sql = sql_file.read_text(encoding="utf-8")
    if re.search(r"\bDROP\s+(?:DATABASE|SCHEMA)\b", sql, flags=re.IGNORECASE):
        raise SystemExit(f"Operación destructiva no aprobada en {directory.name}")
    all_sql.append(sql)

combined = "\n".join(all_sql)
created = re.findall(
    r"CREATE\s+TABLE\s+(?:\[dbo\]\.)?\[([^\]]+)\]",
    combined,
    flags=re.IGNORECASE,
)
counts = Counter(created)
duplicates = sorted(name for name, count in counts.items() if count > 1)
if duplicates:
    raise SystemExit(f"Tablas creadas más de una vez: {', '.join(duplicates)}")

missing = sorted(set(models) - set(created))
if missing:
    raise SystemExit(f"Modelos sin CREATE TABLE en migraciones: {', '.join(missing)}")

lock = (MIGRATIONS / "migration_lock.toml").read_text(encoding="utf-8").strip()
if lock != 'provider = "mssql"':
    raise SystemExit(f"migration_lock.toml inesperado: {lock}")

print(f"PASS SQL Server migration chain: {len(migration_dirs)} migraciones, {len(models)} modelos, {len(created)} tablas.")
