import { useEffect, useState } from "react";

/**
 * Re-render on a short interval and whenever the window becomes visible again. The interval only
 * drives repaints; callers derive time from absolute timestamps, so a throttled or delayed timer
 * never makes a countdown drift.
 */
export function useNow(enabled: boolean, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [enabled, intervalMs]);

  return now;
}
