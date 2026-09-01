// Drives fake Shorts through the content script and records what it does.
//
// The fake <video> elements shadow duration/currentTime/paused/currentSrc via
// Object.defineProperty and emit real (non-bubbling) timeupdate events every
// 150ms, looping at the end — exactly the surface content.js consumes.
//
// Scenario per transition (matches observed YouTube behavior):
//   click on "Next" -> +150ms the URL flips to the next Short id
//                   -> +750ms the old video pauses and the next one plays.
// So for 600ms the OLD video keeps emitting near-end/looped timeupdates under
// the NEW URL — the race that used to cause a double advance.
//
// CCC3 additionally simulates the user pausing right after the video ends
// (during the advance delay): the pending advance must be cancelled and only
// happen after the video is resumed and finishes again.

(() => {
  const VERSION = new URLSearchParams(location.search).get("v") === "old" ? "old" : "new";
  const logEl = document.getElementById("log");
  const t0 = performance.now();
  const events = [];
  const say = (msg) => {
    const line = ((performance.now() - t0) / 1000).toFixed(2).padStart(6) + "  " + msg;
    events.push(line);
    logEl.textContent += line + "\n";
  };

  const SHORTS = [
    { id: "AAA1", dur: 5, startAt: 2.5 },
    { id: "BBB2", dur: 5, startAt: 2.5 },
    { id: "CCC3", dur: 5, startAt: 2.5, pauseDuringPending: true },
    { id: "DDD4", dur: 5, startAt: 2.5 },
  ];
  let idx = -1;
  let currentVideo = null;
  let transitioning = false;
  const clicks = [];
  const wraps = [];
  const videos = new Set();

  function makeVideo(dur) {
    const v = document.createElement("video");
    const state = { t: 0, paused: true, dur, src: "blob:fake-" + Math.random().toString(36).slice(2) };
    Object.defineProperty(v, "duration", { get: () => state.dur, configurable: true });
    Object.defineProperty(v, "currentTime", { get: () => state.t, set: (x) => { state.t = x; }, configurable: true });
    Object.defineProperty(v, "paused", { get: () => state.paused, configurable: true });
    Object.defineProperty(v, "ended", { get: () => false, configurable: true });
    Object.defineProperty(v, "currentSrc", { get: () => state.src, configurable: true });
    v.__state = state;
    document.body.appendChild(v);
    videos.add(v);
    return v;
  }

  // Clock lives in a Worker: page setInterval is throttled to >=1s in hidden
  // tabs, worker timers are not. Steps use real elapsed time so fake video
  // time stays aligned with the wall clock content.js's setTimeout runs on.
  let lastTick = performance.now();
  const worker = new Worker(
    URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 150);"], { type: "text/javascript" }))
  );
  worker.onmessage = () => {
    const nowMs = performance.now();
    const dt = (nowMs - lastTick) / 1000;
    lastTick = nowMs;
    for (const v of videos) {
      const s = v.__state;
      if (s.paused) continue;
      s.t += dt;
      while (s.t >= s.dur) {
        s.t -= s.dur;
        onWrap(v);
      }
      v.dispatchEvent(new Event("timeupdate"));
    }
  };

  function onWrap(v) {
    if (v !== currentVideo) return;
    const short = SHORTS[idx];
    const first = !wraps.some((w) => w.id === short.id);
    wraps.push({ at: performance.now() - t0, id: short.id });
    say("video finished + wrapped (" + short.id + ")");
    if (short.pauseDuringPending && first) {
      setTimeout(() => { v.__state.paused = true; say("user paused " + short.id); }, 400);
      setTimeout(() => { v.__state.paused = false; say("user resumed " + short.id); }, 2600);
    }
  }

  document.querySelector("#navigation-button-down button").addEventListener("click", () => {
    const from = idx >= 0 ? SHORTS[idx].id : "?";
    clicks.push({ at: performance.now() - t0, from });
    say(">>> NEXT clicked (on " + from + ")");
    if (transitioning) {
      say("!!! click during transition — this is the double-press bug");
      return;
    }
    transition();
  });

  function startShort(i) {
    idx = i;
    transitioning = false;
    const short = SHORTS[i];
    const v = makeVideo(short.dur);
    v.__state.t = short.startAt;
    v.__state.paused = false;
    currentVideo = v;
    say("playing " + short.id + " from t=" + short.startAt);
  }

  function transition() {
    if (idx + 1 >= SHORTS.length) {
      say("feed exhausted");
      finish(1500);
      return;
    }
    transitioning = true;
    const old = currentVideo;
    const next = idx + 1;
    setTimeout(() => {
      history.pushState({}, "", "/shorts/" + SHORTS[next].id);
      say("url -> " + SHORTS[next].id);
    }, 150);
    setTimeout(() => {
      old.__state.paused = true;
      startShort(next);
    }, 750);
  }

  let finished = false;
  function finish(after) {
    if (finished) return;
    finished = true;
    setTimeout(() => {
      const doubles = clicks.filter((c, i) => i > 0 && c.at - clicks[i - 1].at < 1200);
      const delays = clicks.map((c) => {
        const w = [...wraps].reverse().find((w) => w.at <= c.at && w.id === c.from);
        return { from: c.from, sAfterVideoEnd: w ? +((c.at - w.at) / 1000).toFixed(2) : null };
      });
      window.__result = {
        version: VERSION,
        clicks: clicks.map((c) => ({ from: c.from, at: +(c.at / 1000).toFixed(2) })),
        doubleClicks: doubles.length,
        delays,
        log: events,
      };
      say("DONE — clicks: " + clicks.length + ", doubles: " + doubles.length);
    }, after);
  }

  setTimeout(() => finish(0), 40000); // safety net so __result always appears

  history.pushState({}, "", "/shorts/" + SHORTS[0].id);
  startShort(0);
})();
