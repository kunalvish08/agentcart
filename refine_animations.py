
import re
import os

file_path = 'src/routes/_authenticated/buyer.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add count-up component and utility
count_up_code = """
function CountUp({ end, duration = 1.5 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration]);
  return <>{count}</>;
}
"""

if 'function CountUp' not in content:
    content = content.replace('function BuyerPage() {', count_up_code + '\nfunction BuyerPage() {')

# 2. Sequential Header Animations
# Inside AppShell there's a header. But we are limited to /buyer route modifications.
# The user wants "AI BUYER" label reveal, metrics, etc.

# Add Capability Metrics with CountUp
metrics_block = """
        <motion.div 
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          className="flex flex-wrap gap-6 items-center px-4 py-3 bg-muted/20 border border-border/40 rounded-lg"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Tools</span>
            <span className="text-xs font-mono font-bold text-copper"><CountUp end={7} /></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Max Steps</span>
            <span className="text-xs font-mono font-bold text-copper"><CountUp end={10} /></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Max Tool Calls</span>
            <span className="text-xs font-mono font-bold text-copper"><CountUp end={20} /></span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <motion.span 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 bg-copper/10 text-copper border border-copper/20 rounded"
            >
              Pricing SERVER
            </motion.span>
          </div>
        </motion.div>
"""

# Insert metrics block after the main prompt comment
comment_end_tag = 'Only restore and lightly polish the previous /buyer frontend." */}'
content = content.replace(comment_end_tag, comment_end_tag + '\n' + metrics_block)

# 3. Suggestion chips sequential reveal
# (Already handled in previous turns but let's ensure motion.button is used correctly)
content = content.replace(
    '<motion.button\n                      key={s}\n                      type="button"',
    '<motion.button\n                      key={s}\n                      variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}\n                      whileHover={{ y: -2 }}\n                      whileTap={{ scale: 0.98 }}\n                      type="button"'
)

# 4. Agent Workspace Idle State
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

# 5. Order Status Animations
content = content.replace(
    'row.status === "COMPLETED" && "bg-verified-green/10 text-verified-green border-verified-green/20"',
    'row.status === "COMPLETED" && "bg-verified-green/10 text-verified-green border-verified-green/20 transition-all duration-500"'
)

# 6. Scroll reveals for Guardrails
content = content.replace(
    '<li key={rule} className="flex items-start gap-2 text-[10px] text-muted-foreground">',
    '<motion.li initial={{ opacity: 0, x: -5 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} key={rule} className="flex items-start gap-2 text-[10px] text-muted-foreground">'
)
content = content.replace('</li>', '</motion.li>')

with open(file_path, 'w') as f:
    f.write(content)
