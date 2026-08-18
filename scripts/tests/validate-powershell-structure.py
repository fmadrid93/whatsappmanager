#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAIRS = {')': '(', ']': '[', '}': '{'}
OPEN = set(PAIRS.values())


def validate(path: Path) -> list[str]:
    text = path.read_text(encoding='utf-8-sig')
    stack: list[tuple[str, int, int]] = []
    errors: list[str] = []
    state = 'normal'
    here_end = ''
    line = 1
    col = 0
    i = 0
    line_start = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ''
        col = i - line_start + 1

        if state == 'here':
            if col == 1 and text.startswith(here_end, i):
                state = 'normal'
                i += len(here_end)
                continue
            if ch == '\n':
                line += 1
                line_start = i + 1
            i += 1
            continue

        if state == 'block_comment':
            if ch == '#' and nxt == '>':
                state = 'normal'; i += 2; continue
            if ch == '\n': line += 1; line_start = i + 1
            i += 1; continue

        if state == 'single':
            if ch == "'" and nxt == "'": i += 2; continue
            if ch == "'": state = 'normal'
            if ch == '\n': line += 1; line_start = i + 1
            i += 1; continue

        if state == 'double':
            if ch == '`': i += 2; continue
            if ch == '"': state = 'normal'
            if ch == '\n': line += 1; line_start = i + 1
            i += 1; continue

        # normal
        if ch == '<' and nxt == '#': state = 'block_comment'; i += 2; continue
        if ch == '#':
            newline = text.find('\n', i)
            if newline == -1: break
            i = newline; continue
        if ch == '@' and nxt in {'"', "'"}:
            # A here-string opener must be followed only by whitespace then newline.
            eol = text.find('\n', i)
            tail = text[i + 2: eol if eol != -1 else len(text)]
            if tail.strip() == '':
                state = 'here'; here_end = nxt + '@'; i += 2; continue
        if ch == "'": state = 'single'; i += 1; continue
        if ch == '"': state = 'double'; i += 1; continue
        if ch in OPEN: stack.append((ch, line, col))
        elif ch in PAIRS:
            if not stack or stack[-1][0] != PAIRS[ch]:
                errors.append(f'{line}:{col} cierre {ch} sin apertura compatible')
            else: stack.pop()
        if ch == '\n': line += 1; line_start = i + 1
        i += 1

    if state != 'normal': errors.append(f'fin de archivo dentro de {state}')
    for symbol, open_line, open_col in stack[-10:]:
        errors.append(f'{open_line}:{open_col} apertura {symbol} sin cierre')
    return errors


def main() -> int:
    paths = sorted((ROOT / 'scripts' / 'windows-native').glob('*.ps1'))
    failures = 0
    for path in paths:
        errors = validate(path)
        if errors:
            failures += 1
            for error in errors:
                print(f'FAIL {path.relative_to(ROOT)}:{error}')
    if failures:
        print(f'NO-GO PowerShell: {failures} archivo(s) con errores estructurales.')
        return 1
    print(f'PASS PowerShell estructural: {len(paths)} scripts.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
