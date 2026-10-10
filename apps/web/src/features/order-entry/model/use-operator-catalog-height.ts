import { useLayoutEffect, useRef } from 'react';

export function useOperatorCatalogHeight() {
  const catalog = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = catalog.current;
    const workspace = element?.closest('.operator-workspace');
    if (!element || !workspace) return;
    let frame = 0;
    function measure() {
      frame = 0;
      const products = element?.querySelector<HTMLElement>('.order-product-options');
      if (!element || !products) return;
      const top = Math.max(16, products.getBoundingClientRect().top);
      const available = `${Math.max(116, Math.floor(window.innerHeight - top - 16))}px`;
      if (element.style.getPropertyValue('--operator-catalog-height') !== available)
        element.style.setProperty('--operator-catalog-height', available);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(workspace);
    resize.observe(element);
    const content = new MutationObserver(schedule);
    content.observe(workspace, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      content.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, []);
  return catalog;
}
