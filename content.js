// Shorts Auto-Scroll — content script.
// When enabled, watches the Short that is currently playing and, once the
// video has played its full duration, waits ADVANCE_DELAY_MS and then
// advances to the next Short.

(() => {
  const ADVANCE_DELAY_MS = 1000; // pause on the finished Short before moving on
  const COOLDOWN_MS = 2000; // ignore end-of-video signals right after advancing

  let enabled = false;
  let pendingTimer = null;
  let pendingId = null;
  let lastAdvanceAt = 0;

  // Per-<video> playback tracking, keyed to the media source so a reused
  // element doesn't carry the previous Short's position into loop detection.
  const lastTimes = new WeakMap();

  chrome.storage.local.get({ enabled: false }).then((value) => {
    enabled = value.enabled === true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue === true;
      if (!enabled) cancelPending();
    }
  });

  function cancelPending() {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingId = null;
    }
  }

  function activeShortId() {
    const match = location.pathname.match(/^\/shorts\/([\w-]+)/);
    return match ? match[1] : null;
  }

  // The advance timestamp is mirrored on <html data-...> so that a second
  // copy of this script (e.g. one orphaned by an extension reload) can never
  // advance a Short this copy already advanced.
  function lastAdvanceStamp() {
    const stamp = Number(document.documentElement.dataset.shortsAutoScrollAt || 0);
    return Math.max(lastAdvanceAt, stamp);
  }

  function markAdvance() {
    lastAdvanceAt = Date.now();
    document.documentElement.dataset.shortsAutoScrollAt = String(lastAdvanceAt);
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

  function scheduleAdvance(id, video, msUntilVideoEnds) {
    pendingId = id;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const scheduledFor = pendingId;
      pendingId = null;
      // Re-check the world after the delay: bail out if the extension was
      // toggled off, the user moved to another Short, the user paused the
      // video, or an advance already happened.
      if (!enabled) return;
      if (activeShortId() !== scheduledFor) return;
      if (video.paused && !video.ended) return;
      if (Date.now() - lastAdvanceStamp() < COOLDOWN_MS) return;
      markAdvance();
      goToNextShort();
    }, ADVANCE_DELAY_MS + msUntilVideoEnds);
  }

  function maybeAdvance(video) {
    if (!chrome.runtime?.id) return; // this copy was orphaned by a reload
    if (!enabled) return;

    const id = activeShortId();
    if (!id) return;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const now = video.currentTime;
    const src = video.currentSrc || video.src;
    const prev = lastTimes.get(video);
    const last = prev && prev.src === src ? prev.time : 0;
    lastTimes.set(video, { src, time: now });

    // Only one advance may be in flight, and right after navigating the
    // previous Short's <video> still emits a few near-end timeupdates under
    // the new URL — the cooldown swallows those instead of advancing again.
    if (pendingTimer !== null) return;
    if (Date.now() - lastAdvanceStamp() < COOLDOWN_MS) return;

    const nearEnd = now >= duration - 0.35;
    // Shorts loop instead of firing "ended", so also catch the wrap to 0.
    const looped = now < last - 1 && last >= duration - 1.5;

    if (nearEnd) {
      scheduleAdvance(id, video, Math.max(0, (duration - now) * 1000));
    } else if (looped) {
      scheduleAdvance(id, video, 0);
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
