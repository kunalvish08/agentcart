import sys
import re

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Imports
if 'import { motion, AnimatePresence } from "framer-motion";' not in content:
    content = content.replace(
        'from "lucide-react";',
        'from "lucide-react";\nimport { motion, AnimatePresence } from "framer-motion";'
    )

# 2. Page Container
# Already partially added in previous turn, let's clean up and add staggered children
container_pattern = re.compile(r'<motion\.div initial=\{\{ opacity: 0 \}\} animate=\{\{ opacity: 1 \}\} className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8">')
if container_pattern.search(content):
    content = container_pattern.sub('<motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8">', content)

# 3. Section reveals
content = content.replace(
    '<section>',
    '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>'
)
content = content.replace(
    '<section className="flex flex-col gap-6">',
    '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col gap-6">'
)
content = content.replace(
    '<section className="space-y-4">',
    '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="space-y-4">'
)
content = content.replace(
    '<section className="bg-muted/10 border border-border/40 rounded-lg p-5">',
    '<motion.section variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="bg-muted/10 border border-border/40 rounded-lg p-5">'
)
# Close sections
# Need to be careful with nesting. In this file sections are top-level children of the main div.

# 4. Chips
content = content.replace(
    '{SUGGESTIONS.map((s) => (',
    '{SUGGESTIONS.map((s, idx) => ('
)
content = content.replace(
    '<button\n                      key={s}\n                      type="button"',
    '<motion.button\n                      key={s}\n                      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}\n                      whileHover={{ y: -2 }}\n                      whileTap={{ scale: 0.98 }}\n                      type="button"'
)

# 5. AssistantTurn
content = content.replace(
    '<div className="flex flex-col gap-3">',
    '<motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-3">'
)

with open(file_path, 'w') as f:
    f.write(content)
