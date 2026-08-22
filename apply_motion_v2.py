
import re
import os

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Staggered Suggestions Logic Fix
# Ensure variants can use the custom index for stagger if needed, 
# although staggerChildren on the parent is often enough.
# The previous turn already set up motion.button, let's make sure the parent is motion.div
content = content.replace(
    '<div className="flex flex-wrap gap-2">',
    '<motion.div variants={{ visible: { transition: { staggerChildren: 0.05 } } }} className="flex flex-wrap gap-2">'
)
content = content.replace(
    '{SUGGESTIONS.map((s, idx) => (',
    '{SUGGESTIONS.map((s) => ('
)
# Revert to simpler map but keep motion.button with variants
content = content.replace(
    'custom={idx}',
    ''
)

# 2. Agent Execution Stagger
content = content.replace(
    '<div className="flex flex-col gap-6">',
    '<motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="flex flex-col gap-6">'
)

# 3. Session rows stagger
content = content.replace(
    'sessions.data!.map((session) => (',
    'sessions.data!.map((session, idx) => ('
)
content = content.replace(
    '<tr key={session.id} className="hover:bg-muted/10 transition-colors">',
    '<motion.tr initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} key={session.id} className="hover:bg-muted/10 transition-colors">'
)
content = content.replace(
    '</tr>',
    '</motion.tr>'
)

# 4. Step entry animation
content = content.replace(
    '<div key={step.step_number} className="flex items-center gap-3 text-sm">',
    '<motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} key={step.step_number} className="flex items-center gap-3 text-sm">'
)

with open(file_path, 'w') as f:
    f.write(content)
