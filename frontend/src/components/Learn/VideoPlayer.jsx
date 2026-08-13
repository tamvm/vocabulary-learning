import React, { useEffect, useRef } from 'react';
import { seekPlayer } from '@/lib/transcriptSync';

export { seekPlayer };

const POLL_MS = 250;

/**
 * YouTube IFrame API player with seekTo + getCurrentTime polling.
 * onReady / onTime are stored in refs so parent re-renders do not remount the player.
 */
export default function VideoPlayer({ videoId, onReady, onTime }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onTimeRef = useRef(onTime);
  onReadyRef.current = onReady;
  onTimeRef.current = onTime;

  useEffect(() => {
    if (!videoId) return undefined;

    let cancelled = false;
    let pollId = null;

    const stopPoll = () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const emitTime = () => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      try {
        const t = player.getCurrentTime();
        if (typeof t === 'number' && Number.isFinite(t)) {
          onTimeRef.current?.(t);
        }
      } catch (_) {
        /* player not ready */
      }
    };

    const startPoll = () => {
      if (pollId || cancelled) return;
      pollId = setInterval(emitTime, POLL_MS);
    };

    const destroyPlayer = () => {
      stopPoll();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (_) {
          /* ignore */
        }
        playerRef.current = null;
      }
    };

    const createTarget = () => {
      if (!hostRef.current) return null;
      hostRef.current.innerHTML = '';
      const target = document.createElement('div');
      target.style.width = '100%';
      target.style.height = '100%';
      hostRef.current.appendChild(target);
      return target;
    };

    const initPlayer = () => {
      if (cancelled || !videoId || !window.YT?.Player) return;
      destroyPlayer();
      const target = createTarget();
      if (!target) return;

      playerRef.current = new window.YT.Player(target, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          enablejsapi: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            onReadyRef.current?.(event.target);
            emitTime();
            startPoll();
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existing = document.getElementById('youtube-iframe-api');
      if (!existing) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        if (!cancelled) initPlayer();
      };
    }

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [videoId]);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <div ref={hostRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

