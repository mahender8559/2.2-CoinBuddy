from pathlib import Path

# The generated DataCard was converted from a clickable div to a semantic
# button, but the final closing tag needs to follow that conversion.
settings = Path('src/components/Settings.tsx')
text = settings.read_text()
marker = 'function DataCard('
if marker not in text:
    raise SystemExit('DataCard marker missing')
head, tail = text.split(marker, 1)
idx = tail.rfind('</div>')
if idx < 0:
    raise SystemExit('Generated DataCard closing div missing')
tail = tail[:idx] + '</button>' + tail[idx + len('</div>'):]
settings.write_text(head + marker + tail)

# Fix the generated params arrays around JSON.stringify() in both integrity
# fixtures: the inner Goal array must close before JSON.stringify closes.
test_file = Path('src/db/sqliteSchema.integrityV32.test.ts')
tests = test_file.read_text()
needle = 'isActive: true })]);'
if tests.count(needle) != 2:
    raise SystemExit(f'Expected two malformed Goal fixture closings, found {tests.count(needle)}')
tests = tests.replace(needle, 'isActive: true }])]);')
test_file.write_text(tests)

print('Fixed generated Settings JSX and integrity fixture syntax.')
