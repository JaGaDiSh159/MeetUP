import { createTransport } from './createTransport';
import { types as mediasoupTypes } from "mediasoup-client";

type TransportResponse = {
    id: string;
    iceParameters: mediasoupTypes.IceParameters;
    iceCandidates: mediasoupTypes.IceCandidate[];
    dtlsParameters: mediasoupTypes.DtlsParameters;
};

export const useCreateRecvTransport = () => {

    const createRecTransport = async (roomId: string, direction: "send" | "recv", device: mediasoupTypes.Device) => {

        const response: TransportResponse = await createTransport(roomId, direction);

        if (!device) {
            console.log("Device not found");
            return
        }

        const recvTransport = device.createRecvTransport(response);
        console.log("📥 Created recv transport:", recvTransport.id);

        // 🔥 REMOVED: Don't attach connect handler here
        // The connect handler will be attached in Room.tsx to avoid duplicates
        // This prevents the race condition where connect() is called multiple times

        return recvTransport;
    };

    return { createRecTransport };
};