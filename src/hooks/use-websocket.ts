
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketHookOptions {
  maxAttempts?: number;
  protocols?: string[]; // Added to support WebSocket subprotocols
}

const useWebSocketConnection = (url: string | null, options: WebSocketHookOptions = {}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null); 
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = options.maxAttempts || 5;
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const connect = useCallback(() => {
    if (!url) {
        console.log("WebSocket URL is null, not connecting.");
        setIsConnected(false);
        return;
    }
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        console.log("WebSocket is already connected.");
        setIsConnected(true); 
        return;
    }

    console.log(`Attempting to connect WebSocket to ${url}, attempt: ${reconnectAttempts + 1}`);
    try {
      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.close();
      }
      
      const ws = options.protocols && options.protocols.length > 0 
        ? new WebSocket(url, options.protocols) 
        : new WebSocket(url);
      socketRef.current = ws; 

      ws.onopen = () => {
        console.log('WebSocket connected successfully to:', url);
        setIsConnected(true);
        setReconnectAttempts(0); 
        setSocket(ws); 
      };

      ws.onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data as string);
            setLastMessage(parsed);
            
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
        setSocket(null); 
        
        if (socketRef.current === ws) { 
            socketRef.current = null;
        }

        if (event.code !== 1000 && url && reconnectAttempts < maxReconnectAttempts) {
          const timeout = Math.min(1000 * (2 ** reconnectAttempts), 30000); 
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
        console.error('WebSocket error on connection to:', url, errorEvent);
      };
      
    } catch (error) {
      console.error('Error establishing WebSocket connection to:', url, error);
      setIsConnected(false);
      setSocket(null);
      if (url && reconnectAttempts < maxReconnectAttempts) {
        const timeout = Math.min(1000 * (2 ** reconnectAttempts), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          // connect(); 
        }, timeout);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reconnectAttempts, maxReconnectAttempts, options.protocols]); 

  useEffect(() => {
    if (url) {
        connect();
    } else { 
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
        socketRef.current.onclose = null; 
        socketRef.current.onerror = null;
        socketRef.current.close(1000, "Component unmounting or URL changed");
        socketRef.current = null;
      }
      setSocket(null); 
      setIsConnected(false);
    };
  }, [url, connect]); 

   useEffect(() => {
    if (url && reconnectAttempts > 0 && reconnectAttempts <= maxReconnectAttempts && (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED)) {
        console.log(`Reconnection attempt ${reconnectAttempts} triggered by state change for ${url}.`);
        connect();
    }
  }, [reconnectAttempts, url, connect, maxReconnectAttempts]);

  const sendMessage = useCallback((data: string | object): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      socketRef.current.send(message);
      return true;
    } else {
      console.error('WebSocket is not connected. Cannot send message.');
      return false;
    }
  }, []); 

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
    }, 30000); 
    
    return () => clearInterval(pingInterval);
  }, [isConnected, sendMessage, url]);

  return { socket: socketRef.current, isConnected, lastMessage, sendMessage };
};

export default useWebSocketConnection;
