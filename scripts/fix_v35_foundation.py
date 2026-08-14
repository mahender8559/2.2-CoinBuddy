from pathlib import Path

manage_path = Path('src/components/ManageFinances.tsx')
manage = manage_path.read_text()
manage = manage.replace('\\n  useEffect(() => {', '\n  useEffect(() => {', 1)
manage_path.write_text(manage)

tour_path = Path('src/components/ButtonTourOverlay.tsx')
tour = tour_path.read_text()
start = tour.find('\\nfunction findVisibleTourTarget')
if start != -1:
    end = tour.find('export const TOUR_STEPS', start)
    if end == -1:
        raise SystemExit('Tour helper end marker missing')
    helper = tour[start:end].replace('\\n', '\n')
    tour = tour[:start] + helper + tour[end:]
tour_path.write_text(tour)

print('Normalized V3.5 generated newlines')
