import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MARGIN_PX = 8;
const GAP_PX = 4;

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// Places a menu below its anchor, above when there is more room there, inside the window.
export function placeMenu({ anchor, size, viewport, align = 'end' }) {
  const roomBelow = viewport.height - anchor.bottom - GAP_PX - MARGIN_PX;
  const roomAbove = anchor.top - GAP_PX - MARGIN_PX;
  const isAbove = size.height > roomBelow && roomAbove > roomBelow;
  const room = isAbove ? roomAbove : roomBelow;
  const height = Math.min(size.height, room);
  const idealTop = isAbove ? anchor.top - GAP_PX - height : anchor.bottom + GAP_PX;
  const idealLeft = align === 'start' ? anchor.left : anchor.right - size.width;
  return {
    top: clamp(idealTop, MARGIN_PX, viewport.height - MARGIN_PX - height),
    left: Math.max(MARGIN_PX, Math.min(idealLeft, viewport.width - MARGIN_PX - size.width)),
    maxHeight: size.height > room ? room : undefined,
  };
}

const HIDDEN_STYLE = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

// Positions a fixed menu next to anchorElement; hidden until measured.
export function useAnchoredMenu(anchorElement, align = 'end') {
  const menuRef = useRef(null);
  const [placed, setPlaced] = useState(null);

  const measure = useCallback(() => {
    const menu = menuRef.current;
    if (!anchorElement || !menu) {
      setPlaced((prev) => (prev === null ? prev : null));
      return;
    }
    // scrollHeight is the natural height even while maxHeight clips the box.
    const size = { width: menu.offsetWidth, height: menu.scrollHeight + menu.offsetHeight - menu.clientHeight };
    const next = placeMenu({
      anchor: anchorElement.getBoundingClientRect(),
      size,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align,
    });
    setPlaced((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.maxHeight === next.maxHeight ? prev : next));
  }, [anchorElement, align]);

  useLayoutEffect(measure);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const style = placed ? { position: 'fixed', top: placed.top, left: placed.left, maxHeight: placed.maxHeight, overflowY: 'auto' } : HIDDEN_STYLE;
  return { menuRef, style };
}
