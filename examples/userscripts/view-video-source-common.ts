/* eslint-disable @typescript-eslint/no-unused-vars -- global API */
const VIDEO_SELECTOR_RETRY_LIMIT = 500;
const VIDEO_SELECTOR_RETRY_INTERVAL = 2e3;
const VIDEO_QUALITY_CHECK_INTERVAL = 1e3;
const VIDEO_QUALITY_FULL_HD_CHECKS_LIMIT = 10;
const EMBEDDED_FRAME_MESSAGE_SOURCE = "embeddedFrame";

function isTopLevelFrame() {
  return window.self === window.top;
}

function videoDetailsFromElement(videoElement: HTMLVideoElement): VideoDetails {
  return { src: videoElement.currentSrc, dpi: videoElement.videoHeight };
}

function getQuality(dpi: number): VideoQuality {
  if (dpi > 0 && dpi < 720) return "standard";
  if (dpi >= 720 && dpi < 1080) return "hd";
  if (dpi >= 1080) return "full-hd";
  return "none";
}

function findVideoElementInDocument() {
  return retry(
    () => {
      const videos = document.querySelectorAll("video");

      if ((videos ?? []).length === 0) {
        window.log.warn("No video elements have been loaded in page yet...");
        return null;
      }

      const candidates = Array.from(videos).filter(
        (el) => el.videoWidth >= 360
      );

      if (candidates.length >= 1) {
        if (candidates.length > 1) {
          window.log.warn("Multiple videos found, returning the first result.");
        } else {
          window.log.info("Resolved video element.");
        }
        return candidates[0];
      }

      return null;
    },
    {
      waitTime: VIDEO_SELECTOR_RETRY_INTERVAL,
      retryLimit: VIDEO_SELECTOR_RETRY_LIMIT,
      retryMessage: "Querying video element...",
      timeoutMessage: "Couldn't resolve video element.",
      throwError: false,
    }
  );
}

function observeVideoQuality(
  videoElement: HTMLVideoElement,
  onUpdate: (update: QualityObserverUpdate) => void
) {
  let checkCount = 0;

  const interval = setInterval(() => {
    checkCount++;
    const details = videoDetailsFromElement(videoElement);

    window.log.info(
      `Updated video details:
			URL: ${details.src}
			Quality: ${details.dpi === 0 ? "loading..." : `${details.dpi}p`}
		`
    );

    onUpdate({
      details,
      checkCount,
      stop: () => clearInterval(interval),
    });
  }, VIDEO_QUALITY_CHECK_INTERVAL);
}

function handleQualityObserverUpdate(
  videoElement: HTMLVideoElement,
  { details, checkCount, stop }: QualityObserverUpdate,
  onDetails: (details: VideoDetails) => void,
  onPlayerError?: () => void
) {
  if (videoElement.error != null) {
    onPlayerError?.();
    stop();
    return;
  }

  if (checkCount === VIDEO_QUALITY_FULL_HD_CHECKS_LIMIT) {
    window.log.warn(
      `Video quality didn't changed to Full HD, quality checker completing with DPI '${details.dpi}p'.`
    );
    stop();
    onDetails(details);
    return;
  }

  window.log.info(
    `Quality checks made: ${checkCount}/${VIDEO_QUALITY_FULL_HD_CHECKS_LIMIT}`
  );

  onDetails(details);

  if (getQuality(details.dpi) === "full-hd") {
    stop();
    window.log.info(
      "Video quality changed to Full HD! The quality observer has ended."
    );
  }
}

async function resolveAndObserveVideo(options: ResolveAndObserveVideoOptions) {
  const {
    onDetails,
    onVideoResolved,
    onNotFound,
    onPlayerError,
    foundMessage = "Found video in page. Starting video quality observer...",
  } = options;

  const videoElement = await findVideoElementInDocument();
  onVideoResolved?.(videoElement);

  if (videoElement == null) {
    onNotFound?.();
    return;
  }

  if (videoElement.error) {
    window.log.warn(
      `Video player encountered an error: ${videoElement.error.message}`
    );
    return;
  }

  window.log.info(foundMessage);

  observeVideoQuality(videoElement, (update) =>
    handleQualityObserverUpdate(videoElement, update, onDetails, () =>
      onPlayerError?.(videoElement.error)
    )
  );
}

function preparePage() {
  if (location.href.includes("camwhores.tv")) {
    document.querySelector("#camsoda-embed")?.remove();
  }
}

function isEmbeddedVideoDetailsMessage(
  data: unknown
): data is EmbeddedVideoDetailsMessage {
  if (data == null || typeof data !== "object") {
    return false;
  }

  const message = data as Partial<EmbeddedVideoDetailsMessage>;
  return (
    message.source === EMBEDDED_FRAME_MESSAGE_SOURCE &&
    message.videoDetails != null
  );
}

function postVideoDetailsToParent(details: VideoDetails) {
  window.log.info("Sending video details to parent frame...");
  window.parent.postMessage(
    {
      source: EMBEDDED_FRAME_MESSAGE_SOURCE,
      videoDetails: details,
    } satisfies EmbeddedVideoDetailsMessage,
    "*"
  );
  window.log.info(`${location.href}: sent video details to parent frame`);
}
