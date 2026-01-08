import { types as mediasoupTypes } from "mediasoup";
import type { Peer } from "../types";

export class Room {
  id: string;
  router: mediasoupTypes.Router;
  peers: Map<string, Peer>;

  constructor(id: string, router: mediasoupTypes.Router) {
    this.id = id;
    this.router = router;
    this.peers = new Map();
  }
}
