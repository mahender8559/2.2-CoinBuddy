from pathlib import Path

path = Path('src/domain/affordability.ts')
text = path.read_text()
old = """    } else if (source?.type === 'liability') {\n      // A future card-financed purchase is still known consumption even though\n"""
new = """    } else if (\n      source?.type === 'liability' &&\n      (transaction.id.startsWith('projection:') ||\n        (transaction.is_verified === 0 && Boolean(transaction.recurringRuleId || transaction.isRecurring)))\n    ) {\n      // A recurring/pending card-financed purchase is still known consumption even though\n"""
if old not in text:
    raise SystemExit('Follow-up affordability liability anchor missing')
path.write_text(text.replace(old, new, 1))
print('Preserved card-payment de-duplication while projecting recurring card charges.')
