#!/usr/bin/env python3
"""Split supabase/migrations/*.sql into small parts (<= 100 lines) for pasting into the Supabase SQL Editor
(for example from a phone). Splits only at a blank line outside a $$ block, so a statement is never cut in half.
Output: test-setup/part-01.sql ... (ignored by git). Parts must be run in order. Usage: python3 scripts/split-migrations.py
"""
import glob, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "test-setup")
MAXL = 100

def units(lines):
    out, cur, in_d = [], [], False
    for ln in lines:
        cur.append(ln)
        if ln.count("$$") % 2 == 1:
            in_d = not in_d
        if ln.strip() == "" and not in_d:
            out.append(cur); cur = []
    if cur: out.append(cur)
    return out

parts = []  # (migration name, text)
for f in sorted(glob.glob(os.path.join(ROOT, "supabase", "migrations", "*.sql"))):
    name = os.path.basename(f)
    lines = open(f, encoding="utf-8").read().rstrip("\n").split("\n")
    acc = []
    chunks = []
    for u in units(lines):
        if acc and len(acc) + len(u) > MAXL:
            chunks.append(acc); acc = []
        acc = acc + u
    chunks.append(acc)
    for i, c in enumerate(chunks):
        parts.append((name, i + 1, len(chunks), "\n".join(c).strip("\n")))

os.makedirs(OUT, exist_ok=True)
for old in glob.glob(os.path.join(OUT, "part-*.sql")): os.remove(old)
total = len(parts)
for n, (name, i, k, text) in enumerate(parts, 1):
    head = f"-- PART {n} of {total}: {name} ({i} of {k}). Run the parts in order.\n"
    tail = f"\n\n-- END OF PART {n} of {total}. If you see this line at the bottom, everything was pasted.\n"
    open(os.path.join(OUT, f"part-{n:02d}.sql"), "w", encoding="utf-8").write(head + text + tail)
print(f"{total} parts written to {OUT}")
