import { createTransport } from './createTransport';
import { types as mediasoupTypes } from "mediasoup-client";

type TransportResponse = {
    id: string;
    iceParameters: mediasoupTypes.IceParameters;
    iceCandidates: mediasoupTypes.IceCandidate[];
    dtlsParameters: mediasoupTypes.DtlsParameters;
};

export const useCreateSendTransport = () => {

    async function createSendTransport(roomId: string, direction: "send" | "recv", device: mediasoupTypes.Device) {

        const response: TransportResponse = await createTransport(roomId, direction)

        if (!device) {
            console.log("device not found");
            return;
        }

        console.log("📤 Creating send transport:", response.id);

        const sendTransport = device.createSendTransport(response);

        // 🔥 REMOVED: Event handlers will be attached in Room.tsx
        // This prevents duplicate handler registration

        return sendTransport;
    }

    return { createSendTransport };
};