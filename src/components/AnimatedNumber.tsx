import { useEffect } from 'react';
import { useSpring, useTransform, motion } from 'motion/react';

export function AnimatedNumber({ value, format }: { value: number, format: (val: number) => string }) {
  const spring = useSpring(0, { bounce: 0, duration: 1500 });
  const display = useTransform(spring, (current) => format(current));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
}
