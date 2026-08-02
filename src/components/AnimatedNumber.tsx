import { useEffect } from 'react';
import { useSpring, useTransform, motion } from 'motion/react';
import { isSafeMathError } from '../utils/safeMath';
import { SafeValueBadge } from './SafeValueBadge';

export function AnimatedNumber({ value, format }: { value: number | string, format: (val: number) => string }) {
  if (isSafeMathError(value)) {
    return <SafeValueBadge errorCode={value} />;
  }

  const numVal = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numVal) || !isFinite(numVal)) {
    return <SafeValueBadge errorCode="ERR_CALC_NAN" />;
  }

  const spring = useSpring(0, { bounce: 0, duration: 1500 });
  const display = useTransform(spring, (current) => format(current));

  useEffect(() => {
    spring.set(numVal);
  }, [spring, numVal]);

  return <motion.span>{display}</motion.span>;
}

