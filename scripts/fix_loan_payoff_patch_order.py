from pathlib import Path

path = Path('src/context/AppContext.tsx')
text = path.read_text()

start = text.find("  const getReservedBalance = useCallback(")
if start < 0:
    raise RuntimeError('payoff helper block start not found')
end_marker = "  }, [loanPayoffState]);\n"
end = text.find(end_marker, start)
if end < 0:
    raise RuntimeError('payoff helper block end not found')
end += len(end_marker)
block = text[start:end]
text = text[:start] + text[end:]

anchor = "  const getAccountBalance = (accountId: string) => accounts.find(a => a.id === accountId)?.balance ?? 0;\n"
if anchor not in text:
    raise RuntimeError('account balance helper anchor not found')
text = text.replace(anchor, anchor + "\n" + block, 1)
path.write_text(text)
print('Moved loan payoff spendable helpers after account projection.')
