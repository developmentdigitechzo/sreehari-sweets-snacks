import { useEffect, useState } from 'react';

/** The current time, refreshed once a minute, so "this slot is now closed" updates while a screen stays open. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
