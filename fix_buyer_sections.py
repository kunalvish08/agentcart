import sys
import re

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the main container first
# From: <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8">
# To: <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8">
content = content.replace(
    '<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}',
    '<motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}'
)

# Fix sections to be motion.section
content = content.replace('<section>', '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>')
content = content.replace('<section className="flex flex-col gap-6">', '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col gap-6">')
content = content.replace('<section className="space-y-4">', '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="space-y-4">')
content = content.replace('<section className="bg-muted/10 border border-border/40 rounded-lg p-5">', '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="bg-muted/10 border border-border/40 rounded-lg p-5">')

# Close all these sections
content = content.replace('</section>', '</motion.section>')

# Fix suggestion chips
content = content.replace(
    '{SUGGESTIONS.map((s) => (',
    '{SUGGESTIONS.map((s, idx) => ('
)
content = content.replace(
    '<button\n                      key={s}\n                      type="button"',
    '<motion.button\n                      key={s}\n                      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}\n                      whileHover={{ y: -2 }}\n                      whileTap={{ scale: 0.98 }}\n                      type="button"'
)
content = content.replace(
    '</button>',
    '</motion.button>'
)

# AssistantTurn
content = content.replace(
    '<div className="flex flex-col gap-3">',
    '<motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-3">'
)
content = content.replace(
    'AssistantTurn({',
    'AssistantTurn({',
)
# Close AssistantTurn div
# assistant turn div is closed at the end of AssistantTurn component.
# Need to be careful.

with open(file_path, 'w') as f:
    f.write(content)
