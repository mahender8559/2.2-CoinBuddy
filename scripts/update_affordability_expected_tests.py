from pathlib import Path

p = Path('src/domain/affordability.test.ts')
text = p.read_text()
text = text.replace("it('includes a credit-card due as a committed future cash obligation'", "it('protects the full credit-card outstanding even when only part is currently due'", 1)
text = text.replace("expect(result.expectedExpenses).toBe(8000);\n    expect(result.expensesByClass.COMMITTED).toBe(8000);", "expect(result.expectedExpenses).toBe(12000);\n    expect(result.creditCardOutstandingReserve).toBe(12000);\n    expect(result.expensesByClass.COMMITTED).toBe(12000);", 1)
p.write_text(text)

p = Path('src/domain/affordability.phase7.integration.test.ts')
text = p.read_text()
text = text.replace("expect(result.expectedExpenses).toBe(62000);", "expect(result.expectedExpenses).toBe(72000);", 1)
text = text.replace("expect(result.expensesByClass.COMMITTED).toBe(60000);", "expect(result.expensesByClass.COMMITTED).toBe(70000);", 1)
text = text.replace("expect(result.projectedCashBeforeSafety).toBe(123000);", "expect(result.projectedCashBeforeSafety).toBe(113000);", 1)
text = text.replace("expect(result.safePurchaseCapacity).toBe(78000);", "expect(result.safePurchaseCapacity).toBe(68000);", 1)
text = text.replace("expect(result.riskyPurchaseCapacity).toBe(93000);", "expect(result.riskyPurchaseCapacity).toBe(83000);", 1)
text = text.replace("const result = plan(85000).projection;", "const result = plan(75000).projection;", 1)
text = text.replace("const result = plan(100000).projection;", "const result = plan(90000).projection;", 1)
p.write_text(text)

print('Updated regression expectations for full revolving-card outstanding protection.')
