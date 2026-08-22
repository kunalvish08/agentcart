import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface CountUpProps {
  value: string | number;
  duration?: number;
}

export function CountUp({ value, duration = 600 }: CountUpProps) {
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<string | number>(shouldReduceMotion ? value : 0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion || hasAnimated) {
      setDisplayValue(value);
      return;
    }

    if (value === undefined || value === null || value === "—") {
       setDisplayValue("—");
       return;
    }

    // Try to parse numeric value from string (e.g., "₹1,00,000" or "12%")
    const stringValue = String(value);
    const numericMatch = stringValue.replace(/,/g, '').match(/\d+/);
    
    if (!numericMatch) {
      setDisplayValue(value);
      return;
    }

    const target = parseInt(numericMatch[0], 10);
    const parts = stringValue.split(numericMatch[0]);
    const prefix = parts[0] || "";
    const suffix = parts[1] || "";

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeProgress = progress * (2 - progress);
      const current = Math.floor(easeProgress * target);
      
      const formatted = `${prefix}${current.toLocaleString("en-IN")}${suffix}`;
      setDisplayValue(formatted);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setHasAnimated(true);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration, shouldReduceMotion, hasAnimated]);

  return <span>{displayValue}</span>;
}
