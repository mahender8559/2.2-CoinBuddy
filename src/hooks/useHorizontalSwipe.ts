import { useRef } from 'react';
import type { MouseEvent, TouchEvent } from 'react';

type SwipeDirection = 'left' | 'right';

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [data-swipe-exempt]';

/** Handles intentional horizontal mobile swipes without interfering with vertical scrolling. */
export function useHorizontalSwipe(onSwipe: (direction: SwipeDirection) => void, allowInteractiveStart = false) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const didSwipe = useRef(false);

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (!allowInteractiveStart && (event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) {
      start.current = null;
      return;
    }
    const touch = event.touches[0];
    didSwipe.current = false;
    start.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (!start.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.current.x;
    const deltaY = touch.clientY - start.current.y;
    start.current = null;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    didSwipe.current = true;
    onSwipe(deltaX < 0 ? 'left' : 'right');
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!didSwipe.current) return;
    event.preventDefault();
    event.stopPropagation();
    didSwipe.current = false;
  };

  return { onTouchStart, onTouchEnd, onClickCapture };
}
