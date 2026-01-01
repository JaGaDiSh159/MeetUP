import { types as mediasoupTypes } from "mediasoup"

export const mediaCodecs: mediasoupTypes.RtpCodecCapability[] = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 111
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {},
        preferredPayloadType: 96
    },
]

export const webRtcTransport_options: mediasoupTypes.WebRtcTransportOptions = {
  listenIps:
    process.env.NODE_ENV === 'production'
      ? [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.WEBRTC_ANNOUNCED_IP!,
          },
        ]
      : [
          {
            ip: '127.0.0.1',
          },
        ],

  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
};

