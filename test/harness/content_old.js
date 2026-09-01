// Shorts Auto-Scroll — content script.
// When enabled, watches the Short that is currently playing and advances to
// the next Short once playback reaches the end of the video's duration.

(() => {
  let enabled = false;

  chrome.storage.local.get({ enabled: false }).then((value) => {
    enabled = value.enabled === true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue === true;
    }
  });

  const lastTimes = new WeakMap();
  let currentId = null;
  let advancedAt = 0;

  function activeShortId() {
    const match = location.pathname.match(/^\/shorts\/([\w-]+)/);
    return match ? match[1] : null;
  }

  function goToNextShort() {
    // YouTube's own "Next video" control; the id is locale-independent.
    const button =
      document.querySelector("#navigation-button-down button") ||
      document.querySelector('button[aria-label="Next video"]');
    if (button) {
      button.click();
      return;
    }
    // Fallback: the Shorts player advances on ArrowDown.
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        which: 40,
        bubbles: true,
        cancelable: true,
      })
    );
  }

  function maybeAdvance(video) {
    if (!enabled) return;

    const id = activeShortId();
    if (!id) return;
    if (id !== currentId) {
      currentId = id;
      advancedAt = 0;
    }
    // Already asked for the next Short; give navigation a moment before retrying.
    if (advancedAt && performance.now() - advancedAt < 2500) return;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const now = video.currentTime;
    const last = lastTimes.get(video) ?? 0;
    lastTimes.set(video, now);

    const nearEnd = now >= duration - 0.35;
    // Shorts loop instead of firing "ended", so also catch the wrap to 0.
    const looped = now < last - 1 && last >= duration - 1.5;

    if (nearEnd || looped) {
      advancedAt = performance.now();
      goToNextShort();
    }
  }

  // timeupdate/ended don't bubble, but capture-phase listeners on document
  // still see them from every <video>, including players YouTube swaps in
  // as you scroll — no MutationObserver needed.
  document.addEventListener(
    "timeupdate",
    (event) => {
      const video = event.target;
      if (video instanceof HTMLVideoElement && !video.paused) {
        maybeAdvance(video);
      }
    },
    true
  );

  document.addEventListener(
    "ended",
    (event) => {
      if (event.target instanceof HTMLVideoElement) {
        maybeAdvance(event.target);
      }
    },
    true
  );
})();
