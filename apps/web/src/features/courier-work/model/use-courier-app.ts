import { useEffect, useState } from 'react';
export function useCourierApp() {
  const [online, setOnline] = useState(true),
    [installed, setInstalled] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    const display = window.matchMedia('(display-mode: standalone)');
    const update = () => {
      setOnline(navigator.onLine);
      setInstalled(display.matches);
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    display.addEventListener('change', update);
    if ('serviceWorker' in navigator && window.isSecureContext)
      void navigator.serviceWorker
        .register('/courier-sw.js', { scope: '/', updateViaCache: 'none' })
        .then(() => {
          if (active) setAvailable(true);
        })
        .catch(() => {
          if (active) setAvailable(false);
        });
    return () => {
      active = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      display.removeEventListener('change', update);
    };
  }, []);
  return { online, installed, available };
}
