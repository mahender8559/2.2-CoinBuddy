from pathlib import Path

path = Path('src/components/Dashboard.tsx')
text = path.read_text()
old = '<button className="text-on-surface-variant hover:text-on-surface"><MoreHorizontal className="w-5 h-5" /></button>'
new = '<MoreHorizontal aria-hidden="true" className="w-5 h-5 text-on-surface-variant/50" />'
count = text.count(old)
if count != 2:
    raise SystemExit(f'Expected exactly 2 dead ellipsis buttons in Dashboard.tsx, found {count}')
path.write_text(text.replace(old, new))
print('Dashboard dead icon buttons replaced with non-interactive decoration.')
