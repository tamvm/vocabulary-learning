import React, { useEffect, useRef, useCallback } from 'react';

/**
 * YouTube IFrame API player with seekTo support.
 */
export default function VideoPlayer({ videoId, onReady }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);

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
          onReady?.(playerRef.current);
        },
      },
    });
  }, [videoId, onReady]);

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
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (_) {
          /* ignore */
        }
        playerRef.current = null;
      }
    };
  }, [videoId, initPlayer]);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

export function seekPlayer(player, seconds) {
  if (!player || typeof seconds !== 'number') return;
  try {
    player.seekTo(Math.max(0, seconds), true);
    if (typeof player.playVideo === 'function') {
      player.playVideo();
    }
  } catch (err) {
    console.warn('seek failed', err);
  }
}
