import type { RefObject } from 'react';
// import { types as mediasoupTypes } from "mediasoup-client"

export type RemoteStream = {
    producerId: string;
    stream: MediaStream;
    userName?: string;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
};

export type VideoCallProps = {
    name: string;
    roomId: string
    localVideoRef: RefObject<HTMLVideoElement>;
    remoteStreams: RemoteStream[];
    onLeave: () => void;
    onToggleMic: (muted: boolean) => void;

};


export interface ConsumeResponse {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: any;
  type: "simple" | "simulcast" | "svc";
  producerPaused: boolean;
  error?: string;
}


export type ParticipantView = {
    id: string;
    stream: MediaStream | null;
    name: string;
    isLocal: boolean;
    isMuted: boolean;
    isVideoOff: boolean;
};


export interface RecordingConfig {
    mimeType: string;
    videoBitsPerSecond: number;
    audioBitsPerSecond: number;
    chunkDurationMs: number;
}
