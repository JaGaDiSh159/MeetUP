import { io } from "socket.io-client";
import { BACKEND_URL } from "../config";

const socket = io(BACKEND_URL, {
  withCredentials: true,
  transports: ["websocket"], // avoids polling 404s on Render
});

export default socket;
