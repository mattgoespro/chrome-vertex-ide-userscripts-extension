declare global {
  type VideoDetails = {
    src: string;
    dpi: number;
  };

  type QualityObserverUpdate = {
    details: VideoDetails;
    checkCount: number;
    stop: () => void;
  };

  type VideoQuality = "standard" | "hd" | "full-hd" | "none";

  type EmbeddedVideoDetailsMessage = {
    source: "embeddedFrame";
    videoDetails: VideoDetails;
  };

  type ResolveAndObserveVideoOptions = {
    onDetails: (details: VideoDetails) => void;
    onVideoResolved?: (videoElement: HTMLVideoElement | null) => void;
    onNotFound?: () => void;
    onPlayerError?: (error: MediaError | null) => void;
    foundMessage?: string;
  };

  function isTopLevelFrame(): boolean;

  function videoDetailsFromElement(
    videoElement: HTMLVideoElement
  ): VideoDetails;

  function getQuality(dpi: number): VideoQuality;

  function findVideoElementInDocument(): Promise<HTMLVideoElement | null>;

  function observeVideoQuality(
    videoElement: HTMLVideoElement,
    onUpdate: (update: QualityObserverUpdate) => void
  ): void;

  function handleQualityObserverUpdate(
    videoElement: HTMLVideoElement,
    update: QualityObserverUpdate,
    onDetails: (details: VideoDetails) => void,
    onPlayerError?: () => void
  ): void;

  function resolveAndObserveVideo(
    options: ResolveAndObserveVideoOptions
  ): Promise<void>;

  function preparePage(): void;

  function isEmbeddedVideoDetailsMessage(
    data: unknown
  ): data is EmbeddedVideoDetailsMessage;

  function postVideoDetailsToParent(details: VideoDetails): void;
}

export {};
