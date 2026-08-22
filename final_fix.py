import sys

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Fix suggestions motion.div closing
content = content.replace(
    '</motion.button>\n                  ))}\n                </div>',
    '</motion.button>\n                  ))}\n                </motion.div>'
)

# Fix section/div nesting in BuyerPage
content = content.replace(
    '</motion.section>\n\n        <motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col gap-6">',
    '</motion.section>\n\n        <motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col gap-6">'
)

# Fix session headers and loading rows
content = content.replace('</motion.tr>\n                </thead>', '</tr>\n                </thead>')
content = content.replace('Loading sessions…</td></tr>', 'Loading sessions…</td></tr>')
content = content.replace('No sessions recorded</td></tr>', 'No sessions recorded</td></tr>')

# Fix order list rows
content = content.replace(
    '<tr className="bg-muted/30 border-b border-border/40">\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Product</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Order</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Amount</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Status</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Date</th>\n              </motion.tr>',
    '<tr className="bg-muted/30 border-b border-border/40">\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Product</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Order</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Amount</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Status</th>\n                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Date</th>\n              </tr>'
)

# Fix OrderRow component motion.tr
content = content.replace(
    'onClick={() => setExpanded(!expanded)}\n      >\n        <td className="px-5 py-3">',
    'onClick={() => setExpanded(!expanded)}\n      >\n        <td className="px-5 py-3">'
)
content = content.replace(
    '</motion.tr>\n      {expanded && (',
    '</tr>\n      {expanded && ('
)
content = content.replace(
    '            </div>\n          </td>\n        </motion.tr>',
    '            </div>\n          </td>\n        </tr>'
)

# Re-wrap OrderRow content if necessary, but keep it simple if possible.
# Actually, the user wants Order rows to reveal sequentially on page load.
# Let's wrap OrderRow's main <tr> in a motion.tr if we can ensure it's balanced.

with open(file_path, 'w') as f:
    f.write(content)
