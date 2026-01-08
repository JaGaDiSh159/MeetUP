import express from "express";
import { createServer } from "http";
import { rooms } from "./signaling/rooms";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { types as mediasoupTypes } from "mediasoup";
// dotenv.config();
import { GetRoom } from "./signaling/rooms";
import { createWebRtcTransport } from "./signaling/transports";
import presignRouter from './routes/presign';
import type { Peer } from "./types";
import cors from "cors";
import cookieParser from 'cookie-parser';
import authRoutes from "./routes/authGoogle"


const app = express();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

// const PORT = 5080;

const PORT = Number(process.env.PORT) || 5080;


app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));


app.use(express.json());
app.use(cookieParser());

app.use('/api/presign', presignRouter);
app.use("/api", authRoutes);


// const roomPeers = new Map<string, Map<string, Peer>>();
// const roomBroadcastedProducers = new Map<string, Set<string>>();

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on(
    "joinRoom",
    async (
      roomId: string,
      callback: (
        response:
          | { rtpCapabilities: mediasoupTypes.RtpCapabilities }
          | { error: string }
      ) => void
    ) => {
      try {
  const room = await GetRoom(roomId);

  const peer: Peer = {
    producerTransport: [],
    consumerTransport: [],
    producers: [],
    consumers: [],
  };

  room.peers.set(socket.id, peer);

  callback({ rtpCapabilities: room.router.rtpCapabilities });
} catch (err: any) {
  callback({ error: err.message });
}

    }
  );

  socket.on(
    "createWebRtcTransport",
    async (
      payload: { direction: "send" | "recv"; roomId: string },
      callback: (
        response:
          | {
            id: string;
            iceParameters: any;
            iceCandidates: any[];
            dtlsParameters: any;
          }
          | { error?: string }
      ) => void
    ) => {
      try {
        const room = await GetRoom(payload.roomId);
        const router = room.router; 

        if (!router) {
          console.log("router not found");
          return callback({ error: "Router not found" });
        }

        const transport = await createWebRtcTransport(router);

        transport.on("@close", () => {
  const peerMap = room.peers;

  const peer = peerMap.get(socket.id);
  if (!peer) return;

  if (payload.direction === "send") {
    peer.producers = peer.producers.filter(
  ({ producer, transportId }: { 
    producer: mediasoupTypes.Producer; 
    transportId: string 
  }) => {

        if (transportId === transport.id) {
          if (!producer.closed) producer.close();
          return false;
        }
        return true;
      }
    );

    peer.producerTransport = peer.producerTransport.filter(
  (t: mediasoupTypes.WebRtcTransport) => t.id !== transport.id
);

  } else {
    peer.consumers = peer.consumers.filter(
  ({ consumer, transportId }: {
    consumer: mediasoupTypes.Consumer;
    transportId: string;
  }) => {

        if (transportId === transport.id) {
          if (!consumer.closed) consumer.close();
          return false;
        }
        return true;
      }
    );

    peer.consumerTransport = peer.consumerTransport.filter(
  (t: mediasoupTypes.WebRtcTransport) => t.id !== transport.id
);

  }
});


        const peerMap = room.peers;

        if (!peerMap) {
          console.log("peerMap not found for room");
          return callback({ error: "Room not found" });
        }

        const peer = peerMap.get(socket.id);
        if (!peer) {
          console.log("peer not found");
          return callback({ error: "Peer not found" });
        }

        if (payload.direction === "send") {
          peer.producerTransport.push(transport);
        } else {
          peer.consumerTransport.push(transport);
        }

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err: any) {
        callback({ error: err.message });
      }
    }
  );

  socket.on(
    "connectTransport",
    async (
      payload: {
        roomId: string;
        transportId: string;
        direction: "send" | "recv";
        dtlsParameters: mediasoupTypes.DtlsParameters;
      },
      callback
    ) => {
      try {
        const room = await GetRoom(payload.roomId);
        const peerMap = room.peers;

        if (!peerMap) {
          return callback({ error: "Room not found" });
        }

        const peer = peerMap.get(socket.id);
        if (!peer) {
          return callback({ error: "Peer not found" });
        }

        let transport: mediasoupTypes.WebRtcTransport | undefined;

if (payload.direction === "recv") {
  transport = peer.consumerTransport.find(
    (t: mediasoupTypes.WebRtcTransport) => t.id === payload.transportId
  );
} else {
  transport = peer.producerTransport.find(
    (t: mediasoupTypes.WebRtcTransport) => t.id === payload.transportId
  );
}

if (!transport) {
  return callback({ error: "Transport not found" });
}

await transport.connect({ dtlsParameters: payload.dtlsParameters });
callback();
      } catch (err: any) {
        callback({ error: err.message });
      }
    }
  );

  socket.on(
  "produce",
  async (
    payload: {
      roomId: string;
      transportId: string;
      kind: mediasoupTypes.MediaKind;
      rtpParameters: mediasoupTypes.RtpParameters;
    },
    callback
  ) => {
    try {
      const room = await GetRoom(payload.roomId);
      const peerMap = room.peers;

      const peer = peerMap.get(socket.id);
      if (!peer) {
        return callback({ error: "Peer not found" });
      }

          const transport = peer.producerTransport.find(
  (t: mediasoupTypes.WebRtcTransport) => t.id === payload.transportId
);
      if (!transport) {
        return callback({ error: "Producer transport not found" });
      }

      const producer = await transport.produce({
        kind: payload.kind,
        rtpParameters: payload.rtpParameters,
      });

      console.log("🎬 PRODUCER CREATED:", producer.id, "by socket:", socket.id);

      peer.producers.push({ producer, transportId: transport.id });

      // 🔥 IMPORTANT: always notify ALL other peers in the room
      for (const [socketId] of peerMap.entries()) {
        if (socketId === socket.id) continue;

        io.to(socketId).emit("newProducer", {
          producerId: producer.id,
          kind: producer.kind,
        });
      }

      callback({ id: producer.id });
    } catch (err: any) {
      callback({ error: err.message });
    }
  }
);


  socket.on(
  "getProducers",
  async (
    roomId: string,
    callback: (response: { producerIds: string[] }) => void
  ) => {
    try {
      const room = await GetRoom(roomId);
      const peerMap = room.peers;

      const producerIds: string[] = [];

      for (const [socketId, peer] of peerMap.entries()) {
        if (socketId === socket.id) continue;

        for (const { producer } of peer.producers) {
          producerIds.push(producer.id);
        }
      }

      callback({ producerIds });
    } catch (err: any) {
      callback({ producerIds: [] });
    }
  }
);


  socket.on(
  "consume",
  async (
    payload: {
      roomId: string;
      transportId: string;
      producerId: string;
      rtpCapabilities: mediasoupTypes.RtpCapabilities;
    },
    callback
  ) => {
    try {
      const room = await GetRoom(payload.roomId);
      const router = room.router;
      const peerMap = room.peers;

      const peer = peerMap.get(socket.id);
      if (!peer) {
        return callback({ error: "Peer not found" });
      }


                const transport = peer.consumerTransport.find(
  (t: mediasoupTypes.WebRtcTransport) => t.id === payload.transportId
);
      if (!transport) {
        return callback({ error: "Consumer transport not found" });
      }

      if (
        !router.canConsume({
          producerId: payload.producerId,
          rtpCapabilities: payload.rtpCapabilities,
        })
      ) {
        return callback({ error: "Cannot consume this producer" });
      }

      const consumer = await transport.consume({
        producerId: payload.producerId,
        rtpCapabilities: payload.rtpCapabilities,
      });

      await consumer.resume();

      peer.consumers.push({ consumer, transportId: transport.id });

      callback({
        id: consumer.id,
        producerId: payload.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err: any) {
      callback({ error: err.message });
    }
  }
);


  socket.on("disconnect", async () => {
  console.log(`Client disconnected: ${socket.id}`);

  // rooms MUST be imported from signaling/rooms
  for (const [roomId, room] of rooms.entries()) {
    const peer = room.peers.get(socket.id);
    if (!peer) continue;

    console.log(`Cleaning up peer in room: ${roomId}`);

    // Notify others that producers are gone
    peer.producers.forEach(
  ({ producer }: { producer: mediasoupTypes.Producer }) => {

      room.peers.forEach((_, otherSocketId) => {
        if (otherSocketId !== socket.id) {
          io.to(otherSocketId).emit("producerLeft", {
            producerId: producer.id,
          });
        }
      });

      if (!producer.closed) producer.close();
      room.broadcastedProducers.delete(producer.id);
    });

    // Close consumers
    peer.consumers.forEach(
  ({ consumer }: { consumer: mediasoupTypes.Consumer }) => {

      if (!consumer.closed) consumer.close();
    });

    // Close transports
    peer.producerTransport.forEach(
  (transport: mediasoupTypes.WebRtcTransport) => {

      if (!transport.closed) transport.close();
    });

    
    peer.consumerTransport.forEach(
  (transport: mediasoupTypes.WebRtcTransport) => {
    if (!transport.closed) transport.close();
  }
);

    // Remove peer
    room.peers.delete(socket.id);

    // Destroy room if empty
    if (room.peers.size === 0) {
      console.log(`Room ${roomId} empty — closing router`);
      room.router.close();
      rooms.delete(roomId);
    }

    break; // socket belongs to only one room
  }
});

});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SFU signaling server running on port ${PORT}`);
});


