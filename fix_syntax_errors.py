import sys

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Fix broken closing tags in sessions table
content = content.replace('</td></motion.tr>', '</td></tr>')
content = content.replace('No sessions recorded</td></motion.tr>', 'No sessions recorded</td></tr>')

# Fix motion.div in execution steps
content = content.replace(
    '</motion.div>\n                  ))}',
    '</div>\n                  ))}'
)

# Fix Ready to Shop animation (it was duplicated or broken)
content = content.replace(
    '<p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Ready to Shop</p>',
    '''<div className="flex items-center gap-2">
                 <motion.div 
                   animate={{ opacity: [0.4, 1, 0.4] }} 
                   transition={{ duration: 2, repeat: Infinity }} 
                   className="size-1.5 rounded-full bg-verified-green" 
                 />
                 <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Ready to Shop</p>
               </div>'''
)

with open(file_path, 'w') as f:
    f.write(content)
