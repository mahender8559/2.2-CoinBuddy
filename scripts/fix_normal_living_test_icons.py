from pathlib import Path
p = Path('src/domain/normalLivingSpending.test.ts')
text = p.read_text()
text = text.replace("icon: 'Wrench'", "icon: 'Home'")
text = text.replace("icon: 'WalletCards'", "icon: 'Target'")
p.write_text(text)
print('Normalized normal-living estimator test icons.')
