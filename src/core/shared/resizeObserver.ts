/**
 * Observe an element for size changes and call a callback on resize.
 * Debounced to avoid excessive renders during drag-resizing.
 */
export function onResize(element: Element, callback: () => void, debounceMs = 300): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let prevWidth = -1;
  let prevHeight = -1;

  const observer = new ResizeObserver(() => {
    const rect = element.getBoundingClientRect();
    if (rect.width === prevWidth && rect.height === prevHeight) return;
    prevWidth = rect.width;
    prevHeight = rect.height;

    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, debounceMs);
  });

  observer.observe(element);
}
