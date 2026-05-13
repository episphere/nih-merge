/**
 * Observe an element for size changes and call a callback on resize.
 * Debounced to avoid excessive renders during drag-resizing.
 *
 * @param onResizeStart - called immediately on the first resize event in a
 *   debounce sequence (e.g. to clear stale content before redrawing).
 */
export function onResize(
  element: Element,
  callback: () => void,
  debounceMs = 300,
  onResizeStart?: () => void,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let prevWidth = -1;
  let prevHeight = -1;

  const observer = new ResizeObserver(() => {
    const rect = element.getBoundingClientRect();
    // Use a 1px tolerance so sub-pixel changes from our own render don't re-trigger
    if (Math.abs(rect.width - prevWidth) < 1 && Math.abs(rect.height - prevHeight) < 1) return;
    prevWidth = rect.width;
    prevHeight = rect.height;

    // If a debounce is already in flight, ignore — don't reset the timer.
    if (timer) return;

    onResizeStart?.();
    timer = setTimeout(() => {
      timer = null;
      callback();
      // Snapshot dimensions after render so the observer ignores our own changes
      const postRect = element.getBoundingClientRect();
      prevWidth = postRect.width;
      prevHeight = postRect.height;
    }, debounceMs);
  });

  observer.observe(element);
}
