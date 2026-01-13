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

  const consumeRef = useRef<((producerId: string) => void) | null>(null);

  const pendingProducersRef = useRef<Set<string>>(new Set());
  const consumedProducersRef = useRef<Set<string>>(new Set());

  // 🔥 NEW: Track send transport to prevent duplicate connect handlers
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);

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
          consumedProducersRef.current.delete(producerId); // 🔥 Allow retry
          return;
        }

        const {
          id,
          kind,
          rtpParameters,
          type,
          producerPaused,
        } = consumeResponse;

        try {
          const newConsumer = await consumerTransport.consume({
            id,
            producerId,
            kind,
            rtpParameters,
          });

          console.log("Consumer type:", type);
          console.log("Producer paused:", producerPaused);

          const remoteStream = new MediaStream();
          remoteStream.addTrack(newConsumer.track);

          setRemoteStreams((prev) => [...prev, { producerId, stream: remoteStream }]);
          
          socket.emit("resumeConsumer", {
            roomId,
            consumerId: newConsumer.id,
          });

          console.log("✅ Consumed stream from producer:", producerId);
        } catch (err) {
          console.error("❌ Failed to consume:", err);
          consumedProducersRef.current.delete(producerId); // 🔥 Allow retry
        }
      }
    );
  }, [roomId]);

  consumeRef.current = consume;

  useEffect(() => {
    const handleNewProducer = ({ producerId }: { producerId: string }) => {
      console.log("📢 New producer detected:", producerId);
      consumeRef.current?.(producerId);
    };

    const handleProducerLeft = ({ producerId }: { producerId: string }) => {
      console.log("👋 Producer left:", producerId);
      consumedProducersRef.current.delete(producerId);

      setRemoteStreams((prev) =>
        prev.filter(({ producerId: id }) => id !== producerId)
      );
    };

    socket.on("connect", () => console.log("✅ Connected to server"));
    socket.on("disconnect", () => console.log("❌ Disconnected from server"));
    socket.on("newProducer", handleNewProducer);
    socket.on("producerLeft", handleProducerLeft);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("newProducer", handleNewProducer);
      socket.off("producerLeft", handleProducerLeft);
    };
  }, []);

  const setupInProgressRef = useRef(false);

  useEffect(() => {
    if (!roomId) {
      toast.info("Room not Found!");
      return;
    }

    // 🔥 FIX: Better setup guard
    if (setupInProgressRef.current) {
      console.warn("⚠️ setup() already running – skipping");
      return;
    }

    setupInProgressRef.current = true;
    console.log("🚀 setup() STARTED");

    async function setup() {
      try {
        if (!roomId) return;

        const joinedDevice = await joinRoom(roomId);
        if (!joinedDevice) return;
        setDevice(joinedDevice);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 🔥 FIX: Create recv transport first and store reference
        const recvTransport = await createRecTransport(roomId, "recv", joinedDevice);
        if (!recvTransport) return;
        
        // 🔥 Only attach connect handler if not already attached
        if (!recvTransportRef.current) {
          recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            console.log("🔗 Recv transport connect event");
            socket.emit(
              "connectTransport",
              {
                roomId,
                transportId: recvTransport.id,
                direction: "recv",
                dtlsParameters,
              },
              (res: { error?: string }) => {
                if (res?.error) {
                  console.error("❌ Recv transport connect failed:", res.error);
                  errback(new Error(res.error));
                } else {
                  console.log("✅ Recv transport connected");
                  callback();
                }
              }
            );
          });
        }
        
        recvTransportRef.current = recvTransport;
        setConsumerTransport(recvTransport);

        // 🔥 FIX: Create send transport and store reference
        const sendTransport = await createSendTransport(roomId, "send", joinedDevice);
        if (!sendTransport) return;

        // 🔥 Only attach handlers if not already attached
        if (!sendTransportRef.current) {
          sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            console.log("🔗 Send transport connect event");
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
                  console.error("❌ Send transport connect failed:", res.error);
                  errback(new Error(res.error));
                } else {
                  console.log("✅ Send transport connected");
                  callback();
                }
              }
            );
          });

          sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            console.log("📤 Send transport produce event");
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
                  console.error("❌ Produce failed:", error);
                  errback(new Error(error ?? "Produce failed"));
                } else {
                  console.log("✅ Produced:", id);
                  callback({ id });
                }
              }
            );
          });
        }
        
        sendTransportRef.current = sendTransport;

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await sendTransport.produce({ track: videoTrack });
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await sendTransport.produce({ track: audioTrack });
        }

        console.log("✅ setup() COMPLETED");
      } catch (err) {
        console.error("❌ setup() FAILED", err);
        setupInProgressRef.current = false; // 🔥 Reset on error
      }
    }

    setup();

    // 🔥 Cleanup function
    return () => {
      console.log("🧹 Cleaning up Room component");
      // Don't reset setupInProgressRef here - let it stay true to prevent re-runs
    };
  }, [roomId, joinRoom, createSendTransport, createRecTransport]);

  useEffect(() => {
    if (!consumerTransport || !device || !roomId) return;

    console.log("✅ Consumer transport ready, fetching producers");

    // 1️⃣ Consume producers already in room
    socket.emit(
      "getProducers",
      roomId,
      ({ producerIds }: { producerIds: string[] }) => {
        console.log("📋 Got existing producers:", producerIds);
        producerIds.forEach((producerId) => {
          consumeRef.current?.(producerId);
        });
      }
    );

    // 2️⃣ Flush buffered producers (from early newProducer events)
    pendingProducersRef.current.forEach((producerId) => {
      console.log("🔄 Flushing buffered producer:", producerId);
      consumeRef.current?.(producerId);
    });

    pendingProducersRef.current.clear();
  }, [consumerTransport, device, roomId]);

  const handleLeave = () => {
    consumedProducersRef.current.clear();
    pendingProducersRef.current.clear();

    // 🔥 Close transports properly
    if (sendTransportRef.current && !sendTransportRef.current.closed) {
      sendTransportRef.current.close();
    }
    if (recvTransportRef.current && !recvTransportRef.current.closed) {
      recvTransportRef.current.close();
    }

    socket.disconnect();

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
