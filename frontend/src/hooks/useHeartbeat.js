import { useEffect, useRef } from 'react';
import { api, getToken } from '../utils/api.js';

/**
 * Hook untuk mengirim heartbeat status user secara berkala saat tab aktif / interaksi.
 */
export function useHeartbeat(enabled = true) {
  const lastHeartbeatRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const sendHeartbeat = async () => {
      const token = getToken();
      if (!token) return;

      const now = Date.now();
      // Throttle minimal 20 detik antar heartbeat
      if (now - lastHeartbeatRef.current < 20000) return;
      lastHeartbeatRef.current = now;

      try {
        await api.post('/api/user-status/heartbeat');
      } catch (err) {
        // Silently fail if network interrupted
      }
    };

    // Heartbeat awal saat mount / login
    sendHeartbeat();

    // Interval heartbeat tiap 45 detik
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    }, 45000);

    // Event listener interaksi user
    const handleActivity = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });
    document.addEventListener('visibilitychange', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      document.removeEventListener('visibilitychange', handleActivity);
    };
  }, [enabled]);
}
