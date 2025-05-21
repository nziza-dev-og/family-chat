
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Constructs a WebSocket URL for the application's backend.
 * Assumes the WebSocket server will be available at '/api/socketio'.
 * @returns The WebSocket URL (e.g., wss://yourdomain.com/api/socketio or ws://localhost:3000/api/socketio)
 *          Returns null if window is not defined (e.g., during SSR).
 */
export function getAppWebSocketURL(): string | null {
  if (typeof window === 'undefined') {
    return null; // Cannot determine hostname on the server
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  // Assuming your WebSocket API route will be at /api/socketio
  // This was common in the full example structure provided earlier.
  return `${protocol}//${host}/api/socketio`;
}
