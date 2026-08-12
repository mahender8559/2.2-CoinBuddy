from pathlib import Path

p = Path('src/components/ManageFinances.tsx')
text = p.read_text()
text = text.replace('setEditRolloverAccountId(undefined); ', '')
text = text.replace('setEditRolloverAccountId(undefined);', '')
if 'setEditRolloverAccountId' in text or 'editRolloverAccountId' in text:
    raise SystemExit('A stale rollover destination reference remains after cleanup.')
p.write_text(text)
print('Removed final stale rollover destination reference.')
