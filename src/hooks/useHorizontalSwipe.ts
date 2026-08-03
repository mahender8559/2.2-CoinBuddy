import { useRef } from 'react';
import type { TouchEvent } from 'react';

type SwipeDirection = 'left' | 'right';

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [data-swipe-exempt]';

/** Handles intentional horizontal mobile swipes without interfering with vertical scrolling. */
export function useHorizontalSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) {
      start.current = null;
      return;
    }
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (!start.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.current.x;
    const deltaY = touch.clientY - start.current.y;
    start.current = null;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    onSwipe(deltaX < 0 ? 'left' : 'right');
  };

  return { onTouchStart, onTouchEnd };
}
