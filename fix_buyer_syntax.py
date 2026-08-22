import sys

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Fix staggered suggestions loop to include idx
content = content.replace(
    '{SUGGESTIONS.map((s) => (',
    '{SUGGESTIONS.map((s, idx) => ('
)

# Fix motion.button in suggestions
content = content.replace(
    '<motion.button\n                      key={s}\n                      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}\n                      whileHover={{ y: -2 }}\n                      whileTap={{ scale: 0.98 }}\n                      type="button"',
    '<motion.button\n                      key={s}\n                      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}\n                      custom={idx}\n                      whileHover={{ y: -2 }}\n                      whileTap={{ scale: 0.98 }}\n                      type="button"'
)

with open(file_path, 'w') as f:
    f.write(content)
