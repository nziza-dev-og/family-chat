
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketHookOptions {
  maxAttempts?: number;
}

const useWebSocketConnection = (url: string | null, options: WebSocketHookOptions = {}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null); // Kept for returning the socket instance if needed by consuming component
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = options.maxAttempts || 5;
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const sendMessage = useCallback((data: string | object): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      socketRef.current.send(message);
      return true;
    } else {
      console.error('WebSocket is not connected. Cannot send message.');
      return false;
    }
  }, []); // socketRef is stable

  const connect = useCallback(() => {
    if (!url) {
        console.log("WebSocket URL is null, not connecting.");
        setIsConnected(false);
        return;
    }
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        console.log("WebSocket is already connected.");
        setIsConnected(true); // Ensure state is correct
        return;
    }

    console.log(`Attempting to connect WebSocket to ${url}, attempt: ${reconnectAttempts + 1}`);
    try {
      // Close any existing socket first to prevent multiple connections
      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.close();
      }
      
      const ws = new WebSocket(url);
      socketRef.current = ws; // Assign to ref immediately

      ws.onopen = () => {
        console.log('WebSocket connected successfully to:', url);
        setIsConnected(true);
        setReconnectAttempts(0); // Reset attempts on successful connection
        setSocket(ws); // Update state
      };

      ws.onmessage = (event) => {
        // console.log('WebSocket message received:', event.data);
        try {
            const parsed = JSON.parse(event.data as string);
            setLastMessage(parsed);
            
            // Example: Handle audio call related messages (can be customized by consumer)
            if (parsed.type === 'call_status' && parsed.status === 'ended') {
              console.log('Call ended by server message:', parsed);
            }
        } catch (e) {
            setLastMessage(event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed. Code:', event.code, 'Reason:', event.reason, 'URL:', url);
        setIsConnected(false);
        setSocket(null); // Clear state
        
        if (socketRef.current === ws) { // Only act if this is the current socket closing
            socketRef.current = null;
        }

        // Don't attempt to reconnect if the close was clean (1000) or if URL is null
        // or if max attempts reached
        if (event.code !== 1000 && url && reconnectAttempts < maxReconnectAttempts) {
          const timeout = Math.min(1000 * (2 ** reconnectAttempts), 30000); // Exponential backoff
          console.log(`WebSocket attempting to reconnect to ${url} in ${timeout / 1000}s (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            // connect(); // connect will be called by useEffect reacting to reconnectAttempts change
          }, timeout);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
            console.log(`WebSocket max reconnect attempts reached for ${url}.`);
        } else if (event.code === 1000) {
            console.log(`WebSocket connection to ${url} closed cleanly.`);
        }
      };

      ws.onerror = (errorEvent) => {
        // An onerror event is always followed by a close event.
        console.error('WebSocket error on connection to:', url, errorEvent);
        // setIsConnected(false); // onclose will handle this
        // setSocket(null);
      };
      
    } catch (error) {
      console.error('Error establishing WebSocket connection to:', url, error);
      setIsConnected(false);
      setSocket(null);
      // Also attempt reconnect on catch if applicable
      if (url && reconnectAttempts < maxReconnectAttempts) {
        const timeout = Math.min(1000 * (2 ** reconnectAttempts), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          // connect(); // connect will be called by useEffect
        }, timeout);
      }
    }
  }, [url, reconnectAttempts, maxReconnectAttempts]); // Removed socket state from dependencies

  // Main effect to connect and disconnect
  useEffect(() => {
    if (url) {
        connect();
    } else { // If URL becomes null, clean up existing socket
        if (socketRef.current) {
            socketRef.current.close(1000, "URL became null");
            socketRef.current = null;
        }
        setSocket(null);
        setIsConnected(false);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        console.log("Closing WebSocket connection on component unmount or URL change (cleanup). URL:", socketRef.current.url);
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onclose = null; // Prevent onclose logic from firing during intentional cleanup
        socketRef.current.onerror = null;
        socketRef.current.close(1000, "Component unmounting or URL changed");
        socketRef.current = null;
      }
      setSocket(null); // Clear state on cleanup
      setIsConnected(false);
    };
  }, [url, connect]); // `connect` is memoized and changes when url or reconnectAttempts change

  // Effect to re-trigger connection when reconnectAttempts changes
   useEffect(() => {
    if (url && reconnectAttempts > 0 && reconnectAttempts <= maxReconnectAttempts && (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED)) {
        console.log(`Reconnection attempt ${reconnectAttempts} triggered by state change for ${url}.`);
        connect();
    }
  }, [reconnectAttempts, url, connect, maxReconnectAttempts]);


  // Add keepalive ping to prevent connection timeout
  useEffect(() => {
    if (!isConnected || !url) return;
    
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          sendMessage({ type: 'ping', timestamp: Date.now() });
        } catch (err) {
          console.warn('Failed to send keepalive ping to', url, err);
        }
      }
    }, 30000); // 30 seconds
    
    return () => clearInterval(pingInterval);
  }, [isConnected, sendMessage, url]);

  return { socket: socketRef.current, isConnected, lastMessage, sendMessage };
};

export default useWebSocketConnection;
