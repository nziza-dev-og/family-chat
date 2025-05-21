
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

// Note: The original snippet had a mysterious mention of an error on line 16.
// This hook implementation appears standard. If an error was occurring,
// it might have been in a specific usage context not provided here.

const useWebSocketConnection = (url: string | null, options = {}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null); // Or more specific type

  const connect = useCallback(() => {
    if (!url) {
        console.log("WebSocket URL is null, not connecting.");
        return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("WebSocket is already connected.");
        return;
    }

    console.log(`Attempting to connect WebSocket to ${url}, attempt: ${reconnectAttempts + 1}`);
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected successfully to:', url);
        setIsConnected(true);
        setReconnectAttempts(0); // Reset attempts on successful connection
      };

      ws.onmessage = (event) => {
        // console.log('WebSocket message received:', event.data);
        try {
            setLastMessage(JSON.parse(event.data as string));
        } catch (e) {
            setLastMessage(event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed', event.code, event.reason);
        setIsConnected(false);
        // Don't attempt to reconnect if the close was clean (e.g., 1000) or if URL is null
        if (event.code !== 1000 && url && reconnectAttempts < maxReconnectAttempts) {
          const timeout = Math.min(1000 * (2 ** reconnectAttempts), 30000); // Exponential backoff
          console.log(`WebSocket attempting to reconnect in ${timeout / 1000}s (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            // connect(); // connect is now a dependency of useEffect, so this will be handled by effect re-run
          }, timeout);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
            console.log("WebSocket max reconnect attempts reached.");
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        // ws.close(); // Ensure connection is closed on error to trigger onclose for reconnect
      };

      setSocket(ws);
    } catch (error) {
      console.error('Error establishing WebSocket connection:', error);
      setIsConnected(false);
      if (url && reconnectAttempts < maxReconnectAttempts) { // Also attempt reconnect on catch
        const timeout = Math.min(1000 * (2 ** reconnectAttempts), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
        }, timeout);
      }
    }
  }, [url, reconnectAttempts, maxReconnectAttempts, socket]); // socket added as dependency

  useEffect(() => {
    if (url) { // Only connect if URL is provided
        connect();
    } else { // If URL becomes null, clean up existing socket
        socket?.close(1000, "URL became null");
        setSocket(null);
        setIsConnected(false);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Closing WebSocket connection on component unmount or URL change.");
        socket.close(1000, "Component unmounting"); // 1000 is a normal closure
      }
      setSocket(null); // Clear socket state on cleanup
      setIsConnected(false);
    };
  }, [url, connect]); // connect is now a dependency

  // Effect to re-trigger connection when reconnectAttempts changes
  useEffect(() => {
    if (url && reconnectAttempts > 0 && reconnectAttempts <= maxReconnectAttempts && (!socket || socket.readyState === WebSocket.CLOSED)) {
        console.log(`Reconnection attempt ${reconnectAttempts} triggered by state change.`);
        connect();
    }
  }, [reconnectAttempts, url, connect, socket, maxReconnectAttempts]);


  const sendMessage = useCallback((data: string | object) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      socket.send(message);
    } else {
      console.error('WebSocket is not connected. Cannot send message.');
    }
  }, [socket]);

  return { socket, isConnected, lastMessage, sendMessage };
};

export default useWebSocketConnection;
