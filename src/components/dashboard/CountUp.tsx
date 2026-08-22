import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

interface CountUpProps {
  value: string | number | undefined | null;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export function CountUp({
  value,
  duration = 800,
  className,
  prefix = "",
  suffix = "",
}: CountUpProps) {
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<string | number>(
    shouldReduceMotion ? (value ?? "—") : 0
  );
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (
      shouldReduceMotion ||
      hasAnimated ||
      value === undefined ||
      value === null ||
      value === "—"
    ) {
      setDisplayValue(value ?? "—");
      return;
    }

    const stringValue = String(value);
    const numericMatch = stringValue.replace(/,/g, "").match(/\d+/);

    if (!numericMatch) {
      setDisplayValue(value);
      return;
    }

    const target = parseInt(numericMatch[0], 10);
    const startValue = 0;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Power 4 Out easing
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(easeProgress * target);

      const formatted = `${prefix}${current.toLocaleString("en-IN")}${suffix}`;
      setDisplayValue(formatted);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setHasAnimated(true);
        setDisplayValue(value); // Ensure exact final value
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration, shouldReduceMotion, hasAnimated, prefix, suffix]);

  return (
    <motion.span
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={className}
    >
      {displayValue}
    </motion.span>
  );
}
