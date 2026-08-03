console.log.bind(window);

window.log = createLogger("Main | View Video Source");
window.toaster = null;

const [viewSourceButton, updateViewSourceButton] = useButton("Open URL", {
  classes: ["ujs-view-src-btn"],
  disabled: true,
});

const [copySourceButton, updateCopySourceButton] = useButton("Copy URL", {
  classes: ["ujs-copy-src-btn"],
  disabled: true,
  onClickFn: () => () => {
    navigator.clipboard.writeText(
      getDataAttributeObject(viewSourceButton).src as string
    );
    window.toaster?.showToast("info", "Copied video source URL to clipboard.");
  },
});

const [openPreviewBoxButton, updateOpenPreviewBoxButton] = useButton(
  "Open Preview",
  {
    classes: ["ujs-open-preview-box-btn"],
    disabled: true,
  }
);

const [logVideoElementButton, updateLogVideoElementButton] = useButton(
  "Log Video Element",
  {
    classes: ["ujs-log-video-element-btn"],
    disabled: true,
  }
);

function getUpdateButtonDpiText(button: HTMLButtonElement, dpi: number) {
  const { text } = getDataAttributeObject(button);
  return `${text} (${dpi === 0 ? "loading..." : `${dpi}p`})`;
}

function applyVideoDetailsToBanner(
  details: VideoDetails,
  options: { dedup?: boolean; logParentUpdate?: boolean } = {}
) {
  const { dedup = false, logParentUpdate = false } = options;

  if (dedup) {
    const current = getDataAttributeObject(viewSourceButton);

    if (current.src === details.src && current.dpi === details.dpi) {
      window.log.info("Button data src and dpi are equal, ignoring.");
      return;
    }
  }

  if (logParentUpdate) {
    window.log.info("Parent frame updating banner...");
  }

  const sharedData = { src: details.src, dpi: details.dpi };

  updateViewSourceButton({
    updateText: (button) => getUpdateButtonDpiText(button, details.dpi),
    onClickFn: onOpenVideoSourceClick(details.src),
    disabled: false,
    data: sharedData,
  });

  updateCopySourceButton({
    disabled: false,
    data: sharedData,
  });

  updateOpenPreviewBoxButton({
    disabled: false,
    onClickFn: () => {
      document.body.appendChild(createVideoPreview(details.src));
      updateOpenPreviewBoxButton({ disabled: true });
    },
  });
}

function dispatchVideoDetails(details: VideoDetails) {
  applyVideoDetailsToBanner(details, { dedup: true, logParentUpdate: true });
}

async function runLocalVideoResolver() {
  await resolveAndObserveVideo({
    onDetails: dispatchVideoDetails,
    onVideoResolved: (videoElement) => {
      updateLogVideoElementButton({
        onClickFn: () => console.dir(videoElement),
        disabled: false,
      });
    },
    onNotFound: () => {
      window.log.warn("Unable to find video in page.");
      window.toaster?.showToast("warn", "Unable to find video in page.");
    },
    onPlayerError: () => {
      window.toaster?.showToast(
        "error",
        "Video player encountered an error, stopping quality observer."
      );
    },
  });
}

function createVideoPreview(srcUrl: string) {
  const box = document.createElement("div");
  box.classList.add("ujs-video-preview-box");

  const header = document.createElement("div");
  header.classList.add("ujs-video-preview-box-header");
  box.appendChild(header);

  const previewVideoElement = document.createElement("video");
  previewVideoElement.classList.add("ujs-video-preview-element");
  previewVideoElement.src = srcUrl;
  previewVideoElement.muted = true;
  previewVideoElement.autoplay = true;
  previewVideoElement.loop = true;
  previewVideoElement.playsInline = true;
  previewVideoElement.controls = true;
  box.appendChild(previewVideoElement);

  const footer = document.createElement("div");
  footer.classList.add("ujs-video-preview-box-footer");
  box.appendChild(footer);

  makeResizable(box, footer);
  makeDraggable(box, header);

  return box;
}

function onOpenVideoSourceClick(srcUrl: string) {
  return () => {
    window.log.info("opening video source URL in new tab...");

    if (srcUrl.startsWith("blob:")) {
      alert(
        window.log.createLogMessage(
          `
					The resolved video has a blob file source URL.
					Search for the m3u8 stream file in the DevTools Network tab and download the video using the \`lux\` video downloader CLI.
					Example: \`lux -m -O '<downloaded_file_name> '<m3u8_url>'\`
				`
        )
      );
      return;
    }

    openUrl(srcUrl);
  };
}

function createBanner() {
  const banner = createPageBanner(
    viewSourceButton,
    copySourceButton,
    openPreviewBoxButton,
    logVideoElementButton
  );
  document.body.appendChild(banner);
  window.log.info("Created page banner.");
  window.toaster = createToaster(banner);
}

function listenForEmbeddedVideoDetails() {
  window.addEventListener("message", (msgEvent) => {
    if (!isEmbeddedVideoDetailsMessage(msgEvent.data)) {
      return;
    }

    window.log.info("Received video details from embedded frame.");
    applyVideoDetailsToBanner(msgEvent.data.videoDetails);
  });
}

/**
 * Top-frame entry: always own the banner, always listen for embedded updates,
 * and only resolve a local video when no fullscreen embed iframe is present yet.
 * An embed may appear later — message listening covers that case.
 */
async function initViewVideoSourceMain() {
  if (!isTopLevelFrame()) {
    window.log.warn(
      "view-video-source-main is intended for the top frame; aborting."
    );
    return;
  }

  window.log.info(`${location.href} is the top frame.`);
  createBanner();
  listenForEmbeddedVideoDetails();

  if (containsEmbeddedFrame()) {
    window.log.info(`${location.href} contains an embedded frame.`);
    window.log.info(
      `${location.origin}: waiting for updates from embedded frame...`
    );
    return;
  }

  window.log.info("No embedded video frame found.");
  window.log.info("Starting local video source resolver...");
  await runLocalVideoResolver();
}

async function loadViewVideoSourceMain() {
  try {
    linkMaterialFonts();
    injectFonts("Open Sans");

    window.log.info(
      `Injected ujs-view-video-source-main script into document with url: ${window.location.href}`
    );

    preparePage();
    await initViewVideoSourceMain();
  } catch (error) {
    alert(
      ["Script `Main | Open Video Source` threw an error.", error.stack].join(
        "\n\n"
      )
    );
    console.error(error);
  }
}

loadViewVideoSourceMain();
