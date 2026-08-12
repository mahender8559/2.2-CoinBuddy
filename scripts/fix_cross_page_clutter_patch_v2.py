from pathlib import Path

# Remove generic/non-data-derived Smart Tips and make remaining tip cards static.
p = Path('src/components/Insights.tsx')
text = p.read_text()
old_else = '''    } else {\n      tips.push({\n        icon: Lightbulb,\n        color: 'secondary',\n        title: 'Review Recent Purchases',\n        desc: `Keeping an eye on smaller purchases can help reduce your overall monthly spending, ${firstName}.`\n      });\n    }\n    \n    tips.push({\n      icon: PiggyBank,\n      color: 'tertiary',\n      title: 'Savings Potential',\n      desc: `Setting aside ${formatCurrency(20)}/week could fund an extra ${formatCurrency(80)} to your savings goal by next month, ${firstName}.`\n    });'''
new_else = '''    }'''
if old_else not in text:
    raise SystemExit('Insights generic Smart Tips block not found')
text = text.replace(old_else, new_else, 1)
old_section = '''        {/* Smart Tips */}\n        <div className="lg:col-span-4 flex flex-col gap-4">\n          <h3 className="text-xl font-bold text-on-surface px-1">Smart Tips</h3>\n          \n          {smartTips.map((tip, i) => (\n            <TipCard \n              key={i}\n              icon={tip.icon} \n              color={tip.color} \n              title={tip.title} \n              desc={tip.desc} \n            />\n          ))}\n        </div>'''
new_section = '''        {/* Smart Tips are shown only when they come from actual ledger signals. */}\n        {smartTips.length > 0 && (\n          <div className="lg:col-span-4 flex flex-col gap-4">\n            <h3 className="text-xl font-bold text-on-surface px-1">Smart Tips</h3>\n            {smartTips.map((tip, i) => (\n              <TipCard key={i} icon={tip.icon} color={tip.color} title={tip.title} desc={tip.desc} />\n            ))}\n          </div>\n        )}'''
if old_section not in text:
    raise SystemExit('Insights Smart Tips section not found')
text = text.replace(old_section, new_section, 1)
text = text.replace('shadow-sm hover:translate-x-1 transition-transform cursor-pointer border-y border-r', 'shadow-sm border-y border-r')
p.write_text(text)

# Refresh the pre-existing spotlight assertion to the current accurate tour copy.
p = Path('e2e/ui-smoke.spec.ts')
text = p.read_text()
old = "await expect(tooltip).toContainText('quickly log income, expenses, or transfers');"
new = "await expect(tooltip).toContainText('Dashboard, Activity, or Insights to log income, expenses, or transfers');"
if old not in text:
    raise SystemExit('Old tour assertion not found')
p.write_text(text.replace(old, new, 1))

print('Removed remaining generic Smart Tips and refreshed tour assertion.')
