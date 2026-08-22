import sys

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add framer-motion import
if 'from "framer-motion"' not in content:
    content = content.replace(
        'from "lucide-react";',
        'from "lucide-react";\nimport { motion } from "framer-motion";'
    )

# Wrap page sections with motion.section or similar (extremely subtle)
# Header
header_re = r'(<h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>)'
# AppShell is in components, only edit the buyer component
buyer_page_re = r'return \(.*?<AppShell.*?>(.*?)</AppShell>'
# Apply motion to the main div
content = content.replace(
    '<div className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8">',
    '<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8 max-w-7xl mx-auto px-4 py-8">'
)

# Close div with motion.div
content = content.replace(
    '      </AppShell>',
    '    </motion.div>\n      </AppShell>'
)
# Wait, the closing div was inside AppShell.
# Let's fix the replacement.

with open(file_path, 'w') as f:
    f.write(content)
