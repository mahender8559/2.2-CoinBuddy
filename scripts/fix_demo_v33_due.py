from pathlib import Path
p = Path('DemoData.json')
s = p.read_text()
if '"dueAmount": 9200' not in s:
    raise SystemExit('demo due amount anchor not found')
p.write_text(s.replace('"dueAmount": 9200', '"dueAmount": 8500', 1))
