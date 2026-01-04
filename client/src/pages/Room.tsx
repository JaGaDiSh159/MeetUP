import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../lib/socket";
import { types as mediasoupTypes } from "mediasoup-client";
import { useJoinRoom } from "../hooks/joinRoom";
import { useCreateSendTransport } from "../hooks/useCreateSendTransport";
import { useCreateRecvTransport } from "../hooks/useCreateRecvTransport";
import VideoCall from "../components/VideoCall";
import { useNavigate } from "react-router-dom";
import type { ConsumeResponse } from "../types";


export default function Room() {

    


    const { roomId } = useParams<{ roomId: string }>();

    const user = localStorage.getItem("user")
    const userData = user ? JSON.parse(user) : null;


    const navigate = useNavigate();

    const [producer, setProducer] = useState<mediasoupTypes.Producer | null>(null);
    const [consumerTransport, setConsumerTransport] = useState<mediasoupTypes.Transport | null>(null);
    const [device, setDevice] = useState<mediasoupTypes.Device | null>(null);

    const [remoteStreams, setRemoteStreams] = useState<{ producerId: string; stream: MediaStream }[]>([]);

    const localVideoRef = useRef<HTMLVideoElement | null>(null);

    const { joinRoom } = useJoinRoom();
    const { createSendTransport } = useCreateSendTransport();
    const { createRecTransport } = useCreateRecvTransport();

    const consumerTransportRef = useRef(consumerTransport);
    const deviceRef = useRef(device);
    consumerTransportRef.current = consumerTransport;
    deviceRef.current = device;

    const consumeRef = useRef<(producerId: string) => void>(null);

    const consume = useCallback(async (producerId: string) => {
        const consumerTransport = consumerTransportRef.current;
        const device = deviceRef.current;

        console.log(
            "🎥 consume() called",
            "producerId =", producerId,
            "consumerTransport =", consumerTransport?.id,
            "device =", !!device
            );


        if (!consumerTransport || !device) {
            console.error("Consumer transport or device missing");
            return;
        }

        if (remoteStreams.find((s) => s.producerId === producerId)) {
            console.log(`Already consuming producer ${producerId}`);
            return;
        }

        

        socket.emit(
            "consume",
            {
                roomId,
                transportId: consumerTransport.id,
                producerId,
                rtpCapabilities: device.rtpCapabilities,
            },
            async (consumeResponse: ConsumeResponse) => {
                if (consumeResponse.error) {
                    console.error("Consume error:", consumeResponse.error);
                    return;
                }

                const { id, kind, rtpParameters } = consumeResponse;

                const newConsumer = await consumerTransport.consume({
                    id,
                    producerId,
                    kind,
                    rtpParameters,
                });

                newConsumer.resume();

                const remoteStream = new MediaStream();
                remoteStream.addTrack(newConsumer.track);

                setRemoteStreams((prev) => [...prev, { producerId, stream: remoteStream }]);

                console.log("Consumed stream from producer:", producerId);
            }
        );
    }, [roomId, remoteStreams]);

    consumeRef.current = consume;

    useEffect(() => {
        const handleNewProducer = ({ producerId }: { producerId: string }) => {
            console.log("New producer detected:", producerId);
            consumeRef.current?.(producerId);
        };

        const handleProducerLeft = ({ producerId }: { producerId: string }) => {
            console.log("Producer left:", producerId);
            setRemoteStreams((prev) => prev.filter(({ producerId: id }) => id !== producerId));
        };

        socket.on("connect", () => console.log("Connected to server"));
        socket.on("disconnect", () => console.log("Disconnected from server"));
        socket.on("newProducer", handleNewProducer);
        socket.on("producerLeft", handleProducerLeft);

        return () => {
            socket.off("connect");
            socket.off("disconnect");
            socket.off("newProducer", handleNewProducer);
            socket.off("producerLeft", handleProducerLeft);
        };
    }, []);

    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        if (!roomId) {
            toast.info("Room not Found!");
            return;
        }
        initialized.current = true;

        async function setup() {
  console.log("🚀 setup() STARTED");

  if (!roomId) {
    console.log("❌ roomId missing");
    return;
  }

  // 1️⃣ Join room
  const joinedDevice = await joinRoom(roomId);
  console.log("✅ joinRoom() DONE", joinedDevice);

  if (!joinedDevice) {
    console.error("❌ Device not found");
    return;
  }
  setDevice(joinedDevice);

  // 2️⃣ Get media
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  console.log("📷 getUserMedia() DONE", stream);

  if (localVideoRef.current) {
    localVideoRef.current.srcObject = stream;
  }

  // 3️⃣ Create send transport
  const sendTransport = await createSendTransport(roomId, "send", joinedDevice);

  if (!sendTransport) {
    console.error("❌ Send transport not created");
    return;
  }

  console.log("🚚 sendTransport CREATED", sendTransport.id);

  // 4️⃣ Attach PRODUCE handler (ONLY ONCE)
  sendTransport.on(
    "produce",
    async ({ kind, rtpParameters }, callback, errback) => {
      socket.emit(
        "produce",
        {
          roomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
        },
        (response: { id?: string; error?: string }) => {
          const { id, error } = response;

          if (error || !id) {
            errback(new Error(error ?? "Producer id missing"));
          } else {
            callback({ id });
          }
        }
      );
    }
  );

  // 5️⃣ Connect transport
  await new Promise<void>((resolve) => {
    sendTransport.on("connect", (_params, callback) => {
      callback();
      resolve();
    });
  });

  // 6️⃣ Produce video
  const videoTrack = stream.getVideoTracks()[0];

  if (!videoTrack) {
    console.log("❌ NO VIDEO TRACK FOUND");
    return;
  }

  console.log("🎥 ABOUT TO CALL sendTransport.produce()");
  const produced = await sendTransport.produce({ track: videoTrack });
  console.log("🎥 sendTransport.produce() RESOLVED", produced);

  setProducer(produced);

  // 7️⃣ Create recv transport
  const recvTransport = await createRecTransport(roomId, "recv", joinedDevice);
  if (recvTransport) {
    setConsumerTransport(recvTransport);
  }
}


        setup();
    }, [roomId, joinRoom, createSendTransport, createRecTransport]);

    useEffect(() => {
    if (!consumerTransport || !device || !roomId) return;

    console.log("✅ Consumer transport ready, fetching producers");

    socket.emit(
        "getProducers",
        roomId,
        ({ producerIds }: { producerIds: string[] }) => {
            producerIds.forEach((producerId) => {
                consumeRef.current?.(producerId);
                    });
                }
            );
        }, [consumerTransport, device, roomId]);



    const handleLeave = () => {
        socket.disconnect();
        producer?.close();
        navigate("/");
    };


    const handleToggleMic = (muted: boolean) => {
        if (localVideoRef.current && localVideoRef.current.srcObject) {
            const stream = localVideoRef.current.srcObject as MediaStream;
            stream.getAudioTracks().forEach((track) => {
                track.enabled = !muted;
            });
        }
    };

    return (
        <VideoCall
            name={userData.name}
            roomId={roomId || ""}
            localVideoRef={localVideoRef as React.RefObject<HTMLVideoElement>}
            remoteStreams={remoteStreams}
            onLeave={handleLeave}
            onToggleMic={handleToggleMic}

        />
    );
}
