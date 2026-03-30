import { useRef } from 'preact/hooks';

interface LongPressOptions {
  onLongPress: () => void;
  onClick: () => void;
  threshold?: number;
}

export function useLongPress({ onLongPress, onClick, threshold = 500 }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const cancel = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return {
    onPointerDown: () => {
      didLongPress.current = false;
      timerRef.current = setTimeout(() => {
        didLongPress.current = true;
        onLongPress();
      }, threshold);
    },
    onPointerUp: () => {
      cancel();
      if (!didLongPress.current) onClick();
    },
    onPointerLeave: cancel,
    onContextMenu: (e: Event) => e.preventDefault(),
  };
}
