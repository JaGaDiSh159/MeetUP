import { types as mediasoupTypes } from "mediasoup";

export const mediaCodecs: mediasoupTypes.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: undefined as any,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    preferredPayloadType: undefined as any,
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    preferredPayloadType: undefined as any,
  },
];

export const webRtcTransport_options: mediasoupTypes.WebRtcTransportOptions = {
  listenIps:
    process.env.NODE_ENV === "production"
      ? [
          {
            ip: "0.0.0.0",
            // 🔥 FIX: Use undefined to auto-detect IP (works with Render free tier!)
            announcedIp: undefined,
          },
        ]
      : [
          {
            ip: "127.0.0.1",
          },
        ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true, // Try UDP first, fallback to TCP if needed
};