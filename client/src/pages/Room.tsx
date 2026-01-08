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

    const pendingProducersRef = useRef<Set<string>>(new Set());
    const consumedProducersRef = useRef<Set<string>>(new Set());


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
    console.log("⏳ consume delayed, buffering producer:", producerId);
    pendingProducersRef.current.add(producerId);
    return;
}


        if (consumedProducersRef.current.has(producerId)) {
  console.log("⛔ Already consuming producer:", producerId);
  return;
}

consumedProducersRef.current.add(producerId);


        

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
            consumedProducersRef.current.delete(producerId);

setRemoteStreams((prev) =>
  prev.filter(({ producerId: id }) => id !== producerId)
);

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

// 🔒 GLOBAL GUARD — VERY IMPORTANT
let setupInProgress = false;

async function setup() {
  if (setupInProgress) {
    console.warn("⚠️ setup() already in progress, skipping");
    return;
  }

  setupInProgress = true;
  console.log("🚀 setup() STARTED");

  try {
    if (!roomId) {
      console.warn("⚠️ No roomId, aborting setup");
      return;
    }

    // 1️⃣ JOIN ROOM & LOAD DEVICE
    const joinedDevice = await joinRoom(roomId);
    if (!joinedDevice) {
      console.error("❌ Failed to join room");
      return;
    }
    setDevice(joinedDevice);

    // 2️⃣ GET USER MEDIA
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // 3️⃣ CREATE RECV TRANSPORT FIRST
    const recvTransport = await createRecTransport(
      roomId,
      "recv",
      joinedDevice
    );

    if (!recvTransport) {
      console.error("❌ recvTransport creation failed");
      return;
    }

    setConsumerTransport(recvTransport);
    console.log("📥 recvTransport CREATED", recvTransport.id);

    // 4️⃣ CREATE SEND TRANSPORT
    const sendTransport = await createSendTransport(
      roomId,
      "send",
      joinedDevice
    );

    if (!sendTransport) {
      console.error("❌ sendTransport creation failed");
      return;
    }

    console.log("📤 sendTransport CREATED", sendTransport.id);

    // 5️⃣ CONNECT SEND TRANSPORT (DTLS)
    sendTransport.on(
      "connect",
      ({ dtlsParameters }, callback, errback) => {
        console.log("🔌 sendTransport connect event");

        socket.emit(
          "connectTransport",
          {
            roomId,
            transportId: sendTransport.id,
            direction: "send",
            dtlsParameters,
          },
          (res: { error?: string }) => {
            if (res?.error) {
              console.error("❌ sendTransport connect failed", res.error);
              errback(new Error(res.error));
            } else {
              console.log("✅ sendTransport connected");
              callback(); // 🔴 MUST be called ONCE
            }
          }
        );
      }
    );

    // 6️⃣ PRODUCE HANDLER
    sendTransport.on(
      "produce",
      ({ kind, rtpParameters }, callback, errback) => {
        console.log("🎬 produce event fired:", kind);

        socket.emit(
          "produce",
          {
            roomId,
            transportId: sendTransport.id,
            kind,
            rtpParameters,
          },
          ({ id, error }: { id?: string; error?: string }) => {
            if (error || !id) {
              console.error("❌ produce failed", error);
              errback(new Error(error ?? "Produce failed"));
            } else {
              console.log("✅ producerId received:", id);
              callback({ id }); // 🔴 EXACTLY ONCE
            }
          }
        );
      }
    );

    // 7️⃣ PRODUCE VIDEO
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.error("❌ No video track found");
      return;
    }

    const videoProducer = await sendTransport.produce({
      track: videoTrack,
    });

    setProducer(videoProducer);
    console.log("🎥 Video produced:", videoProducer.id);

    // 8️⃣ PRODUCE AUDIO (OPTIONAL)
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      await sendTransport.produce({ track: audioTrack });
      console.log("🎤 Audio produced");
    }

    console.log("✅ setup() COMPLETED SUCCESSFULLY");
  } catch (err) {
    console.error("❌ setup() FAILED", err);
    setupInProgress = false; // allow retry on failure
  }
}




        setup();
    }, [roomId, joinRoom, createSendTransport, createRecTransport]);

useEffect(() => {
  if (!consumerTransport || !device || !roomId) return;

  console.log("✅ Consumer transport ready, fetching producers");

  // 1️⃣ Consume producers already in room
  socket.emit(
    "getProducers",
    roomId,
    ({ producerIds }: { producerIds: string[] }) => {
      producerIds.forEach((producerId) => {
        consumeRef.current?.(producerId);
      });
    }
  );

  // 2️⃣ Flush buffered producers (from early newProducer events)
  pendingProducersRef.current.forEach((producerId) => {
    console.log("🔁 Flushing buffered producer:", producerId);
    consumeRef.current?.(producerId);
  });

  pendingProducersRef.current.clear();
}, [consumerTransport, device, roomId]);




    const handleLeave = () => {
  consumedProducersRef.current.clear();
  pendingProducersRef.current.clear();

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
