
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';
import { Server as SocketIOServer, Socket } from 'socket.io';

interface SocketServer extends HTTPServer {
  io?: SocketIOServer;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

interface Participant {
  id: string;
  isInitiator: boolean;
}

interface Room {
  participants: Participant[];
  createdAt: Date;
}

const rooms = new Map<string, Room>();

const SocketHandler = (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  if (res.socket.server.io) {
    console.log('Socket is already running');
  } else {
    console.log('Socket is initializing');
    const io = new SocketIOServer(res.socket.server, {
      path: '/api/socket', // This path is important for the client connection
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://your-production-domain.com'] // Replace with your actual production domain
          : ['http://localhost:9002', 'http://localhost:3000', 'http://localhost:3001'], // Allow local dev
        methods: ['GET', 'POST']
      }
    });
    res.socket.server.io = io;

    io.on('connection', (socket: Socket) => {
      console.log('User connected:', socket.id);

      socket.on('create-room', ({ roomId }: { roomId: string }) => {
        if (rooms.has(roomId)) {
          socket.emit('room-error', { message: 'Room already exists' });
          return;
        }

        rooms.set(roomId, {
          participants: [{ id: socket.id, isInitiator: true }],
          createdAt: new Date()
        });

        socket.join(roomId);
        socket.emit('room-created', { roomId });
        console.log(`Room ${roomId} created by ${socket.id}`);
      });

      socket.on('join-room', ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId);
        if (!room) {
          socket.emit('room-error', { message: 'Room not found' });
          return;
        }

        // Simplified: allow more than 2 for now, example had limit
        // if (room.participants.length >= 2) { 
        //   socket.emit('room-error', { message: 'Room is full' });
        //   return;
        // }

        room.participants.push({ id: socket.id, isInitiator: false });
        socket.join(roomId);
        
        socket.emit('room-joined', { 
          roomId, 
          participants: room.participants.filter(p => p.id !== socket.id) 
        });

        // Notify others in the room
        socket.to(roomId).emit('user-joined', { id: socket.id });
        console.log(`User ${socket.id} joined room ${roomId}`);
      });

      socket.on('offer', ({ offer, roomId }: { offer: any, roomId: string }) => {
        // Send to all others in the room except sender
        socket.to(roomId).emit('offer', { offer, from: socket.id });
      });

      socket.on('answer', ({ answer, roomId, to }: { answer: any, roomId: string, to: string }) => {
         // Send to all others in the room except sender
        socket.to(roomId).emit('answer', { answer, from: socket.id });
      });

      socket.on('ice-candidate', ({ candidate, roomId }: { candidate: any, roomId: string }) => {
         // Send to all others in the room except sender
        socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
      });

      socket.on('leave-room', ({ roomId }: { roomId: string }) => {
        handleLeaveRoom(socket, roomId);
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [roomId, roomData] of rooms.entries()) {
          if (roomData.participants.some(p => p.id === socket.id)) {
            handleLeaveRoom(socket, roomId);
          }
        }
      });

      const handleLeaveRoom = (currentSocket: Socket, roomId: string) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const initialParticipantCount = room.participants.length;
        room.participants = room.participants.filter(p => p.id !== currentSocket.id);
        
        if (room.participants.length < initialParticipantCount) { // if user was actually in the room
            currentSocket.to(roomId).emit('user-left', { id: currentSocket.id });
            console.log(`User ${currentSocket.id} left room ${roomId}`);
        }

        if (room.participants.length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted as it's empty`);
        }
        currentSocket.leave(roomId);
      };
    });
  }
  res.end();
};

export default SocketHandler;
