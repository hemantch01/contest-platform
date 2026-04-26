'use client';

/**
 * Custom hook that wraps the native WebSocket API.
 * Usage:
 *   const { send, lastMessage, isConnected } = useSocket(token);
 *   send('join-contest', { contestId, username });
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? `ws://${window.location.host}/ws` : 'ws://localhost/ws');

interface WsMessage {
  event: string;
  data: Record<string, unknown>;
}

export function useSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: Record<string, unknown>) => void>>>(new Map());

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data);
        setLastMessage(msg);
        // Dispatch to event-specific listeners
        const handlers = listenersRef.current.get(msg.event);
        if (handlers) {
          handlers.forEach((fn) => fn(msg.data));
        }
      } catch { /* ignore bad messages */ }
    };

    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [token]);

  const send = useCallback((event: string, data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  const on = useCallback((event: string, handler: (data: Record<string, unknown>) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);
    return () => { listenersRef.current.get(event)?.delete(handler); };
  }, []);

  return { send, on, lastMessage, isConnected };
}
