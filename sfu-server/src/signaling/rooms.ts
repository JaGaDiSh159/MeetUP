import { types as mediasoupTypes } from "mediasoup";
import { getWorker } from "./worker";
import { mediaCodecs } from "../config";

export interface Room {
  id: string;
  router: mediasoupTypes.Router;
  peers: Map<string, any>;
  broadcastedProducers: Set<string>;
}

export const rooms = new Map<string, Room>();

export async function GetRoom(roomId: string): Promise<Room> {
  let room = rooms.get(roomId);

  if (!room) {
    const worker = await getWorker();
    const router = await worker.createRouter({ mediaCodecs });

    room = {
      id: roomId,
      router,
      peers: new Map(),
      broadcastedProducers: new Set(),
    };

    rooms.set(roomId, room);
    console.log(`Room created: ${roomId}`);
  }

  return room;
}
