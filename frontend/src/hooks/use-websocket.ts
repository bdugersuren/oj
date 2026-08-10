"use client";

import { useEffect, useRef } from "react";
import { websocketUrl } from "@/lib/api/client";

export function useWebsocket(path: string | null, onMessage: (data: Record<string, unknown>) => void) {
  const callback = useRef(onMessage);
  useEffect(() => {
    callback.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    if (!path) return;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(websocketUrl(path));
      socket.onmessage = (event) => callback.current(JSON.parse(event.data));
      socket.onclose = (event) => { if (!stopped && event.code !== 1000) retry = setTimeout(connect, 1000); };
    };
    connect();
    return () => { stopped = true; if (retry) clearTimeout(retry); socket?.close(); };
  }, [path]);
}
