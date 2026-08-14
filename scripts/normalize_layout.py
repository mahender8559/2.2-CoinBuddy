from pathlib import Path

replacements = {
    'src/App.tsx': [
        ('<div className="w-full mx-auto px-3 sm:px-5 py-4 sm:py-6 pb-28 md:pb-6">',
         '<div className="w-full max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-6 pb-28 md:pb-6">'),
    ],
    'src/components/Dashboard.tsx': [
        ('<div className="space-y-6 animate-fade-in pb-24 md:pb-0 max-w-lg mx-auto relative">',
         '<div data-testid="page-dashboard" className="w-full space-y-6 animate-fade-in pb-24 md:pb-0 relative">'),
    ],
    'src/components/Activity.tsx': [
        ('<div className="space-y-6 pb-24 md:pb-0 animate-fade-in">',
         '<div data-testid="page-activity" className="w-full space-y-6 pb-24 md:pb-0 animate-fade-in">'),
    ],
    'src/components/ManageFinances.tsx': [
        ('<div className="space-y-6 animate-fade-in pb-safe touch-pan-y" {...mainTabSwipe}>',
         '<div data-testid="page-manage" className="w-full space-y-6 animate-fade-in pb-safe touch-pan-y" {...mainTabSwipe}>'),
    ],
    'src/components/Cards.tsx': [
        ('<div className="space-y-10 pb-24 md:pb-0 animate-fade-in max-w-3xl mx-auto">',
         '<div data-testid="page-accounts" className="w-full space-y-10 pb-24 md:pb-0 animate-fade-in">'),
    ],
    'src/components/Settings.tsx': [
        ('<div className="space-y-8 pb-24 md:pb-0 max-w-3xl mx-auto animate-fade-in relative">',
         '<div data-testid="page-settings" className="w-full space-y-8 pb-24 md:pb-0 animate-fade-in relative">'),
    ],
    'src/components/Insights.tsx': [
        ('<div className="space-y-8 pb-24 md:pb-0 animate-fade-in">',
         '<div data-testid="page-insights" className="w-full space-y-8 pb-24 md:pb-0 animate-fade-in">'),
    ],
}

for filename, pairs in replacements.items():
    path = Path(filename)
    text = path.read_text()
    for old, new in pairs:
        if new in text:
            continue
        if old not in text:
            raise SystemExit(f'Expected layout marker not found in {filename}: {old}')
        text = text.replace(old, new, 1)
    path.write_text(text)
