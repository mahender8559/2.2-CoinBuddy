from pathlib import Path

path = Path('src/components/Settings.tsx')
text = path.read_text()

old_edit = '''            <button 
              onClick={() => setEditProfileOpen(true)}
              className="p-1.5 rounded-full bg-surface-variant text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            >'''
new_edit = '''            <button 
              type="button"
              aria-label="Edit profile"
              title="Edit profile"
              onClick={() => setEditProfileOpen(true)}
              className="p-1.5 rounded-full bg-surface-variant text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            >'''
if old_edit not in text:
    raise SystemExit('Edit profile button markup not found')
text = text.replace(old_edit, new_edit, 1)

old_theme = '''                <button
                  key={c.id}
                  onClick={() => setColorPalette(c.id)}
                  className={`w-8 h-8 shrink-0 rounded-full ${c.color} flex items-center justify-center transition-transform ${colorPalette === c.id ? 'ring-2 ring-on-surface ring-offset-2 ring-offset-surface-container scale-110' : 'hover:scale-110'}`}
                >'''
new_theme = '''                <button
                  key={c.id}
                  type="button"
                  aria-label={`Use ${c.id} color theme`}
                  aria-pressed={colorPalette === c.id}
                  title={`Use ${c.id} color theme`}
                  onClick={() => setColorPalette(c.id)}
                  className={`w-8 h-8 shrink-0 rounded-full ${c.color} flex items-center justify-center transition-transform ${colorPalette === c.id ? 'ring-2 ring-on-surface ring-offset-2 ring-offset-surface-container scale-110' : 'hover:scale-110'}`}
                >'''
if old_theme not in text:
    raise SystemExit('Color theme button markup not found')
text = text.replace(old_theme, new_theme, 1)

path.write_text(text)
print('Settings icon and color-theme buttons now expose accessible names and pressed state.')
