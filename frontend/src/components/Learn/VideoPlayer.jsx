import React, { useEffect, useRef, useCallback } from 'react';

/**
 * YouTube IFrame API player with seekTo + playback time polling.
 */
export default function VideoPlayer({ videoId, onReady, onTimeUpdate }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const pollRef = useRef(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      try {
        if (typeof player.getCurrentTime !== 'function') return;
        const t = player.getCurrentTime();
        if (typeof t === 'number' && !Number.isNaN(t)) {
          onTimeUpdateRef.current?.(t);
        }
      } catch (_) {
        /* player may be mid-destroy */
      }
    }, 250);
  }, [stopPolling]);

  const initPlayer = useCallback(() => {
    if (!videoId || !containerRef.current || !window.YT?.Player) return;
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (_) {
        /* ignore */
      }
      playerRef.current = null;
      readyRef.current = false;
    }

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        enablejsapi: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          readyRef.current = true;
          onReadyRef.current?.(playerRef.current);
          startPolling();
        },
        onStateChange: (event) => {
          // Keep polling while playing or buffering; still useful when paused for UI sync after seek
          if (event?.data === window.YT?.PlayerState?.PLAYING) {
            startPolling();
          }
        },
      },
    });
  }, [videoId, startPolling]);

  useEffect(() => {
    if (!videoId) return undefined;

    let cancelled = false;

    const start = () => {
      if (!cancelled) initPlayer();
    };

    if (window.YT?.Player) {
      start();
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
        start();
      };
    }

    return () => {
      cancelled = true;
      stopPolling();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (_) {
          /* ignore */
        }
        playerRef.current = null;
        readyRef.current = false;
      }
    };
  }, [videoId, initPlayer, stopPolling]);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

export function seekPlayer(player, seconds) {
  if (!player || typeof seconds !== 'number' || Number.isNaN(seconds)) return false;
  try {
    if (typeof player.seekTo !== 'function') return false;
    player.seekTo(Math.max(0, seconds), true);
    if (typeof player.playVideo === 'function') {
      player.playVideo();
    }
    return true;
  } catch (err) {
    console.warn('seek failed', err);
    return false;
  }
}
