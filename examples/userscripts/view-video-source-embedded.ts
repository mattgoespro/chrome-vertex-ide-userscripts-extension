console.log.bind(window);

window.log = createLogger("Embedded | View Video Source");

/**
 * Embedded-frame entry: resolve the video here and forward details to the
 * top-frame main script. Never owns the banner UI.
 */
async function initViewVideoSourceEmbedded() {
  if (isTopLevelFrame()) {
    window.log.warn(
      "view-video-source-embedded is intended for embedded frames; aborting."
    );
    return;
  }

  window.log.info(`Running in embedded frame URL: `, location.origin);
  window.log.info("Starting video source resolver...");

  await resolveAndObserveVideo({
    onDetails: postVideoDetailsToParent,
    onNotFound: () => {
      window.log.warn("Unable to find video in embedded frame.");
    },
    onPlayerError: () => {
      window.log.warn(
        "Video player encountered an error, stopping quality observer."
      );
    },
    foundMessage: "Found video in embedded frame. Starting quality observer...",
  });
}

async function loadViewVideoSourceEmbedded() {
  try {
    window.log.info(
      `Injected ujs-view-video-source-embedded script into document with url: ${window.location.href}`
    );

    preparePage();
    await initViewVideoSourceEmbedded();
  } catch (error) {
    console.error(
      "Script `Embedded | Open Video Source` threw an error.",
      error
    );
  }
}

loadViewVideoSourceEmbedded();
