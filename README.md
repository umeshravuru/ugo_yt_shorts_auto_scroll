# Shorts Auto-Scroll (Chrome extension)

Auto-advances YouTube Shorts: when the current Short finishes playing (its full
duration elapses), the extension scrolls to the next one. It is **off by
default** — click the toolbar icon to toggle it on or off.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin **Shorts Auto-Scroll** to the toolbar (puzzle-piece menu → pin).

## Use

- Click the icon to toggle. The badge shows **ON** (green) or **OFF** (gray);
  the default is OFF.
- While ON, open `youtube.com/shorts` and watch. When a Short finishes playing
  its full duration, the extension waits **1 second** and then advances to the
  next Short.
- Pausing a video pauses the auto-advance — pausing during the 1-second wait
  cancels it (it re-arms the next time the video finishes).
- Toggling applies immediately to tabs that are already open — no refresh
  needed. (After *updating the extension itself*, do refresh open YouTube
  tabs so the old copy of the content script is gone.)

## How it works

- `content.js` watches the playing `<video>` on `/shorts/` pages. When
  `currentTime` reaches the video's `duration` (or the player loops back to
  the start), it schedules one advance for 1 second after the end, then clicks
  YouTube's own "Next video" control, falling back to a simulated `ArrowDown`
  key press.
- Only one advance can be in flight, and a 2-second cooldown after each
  advance absorbs the trailing events YouTube's outgoing video emits under the
  new URL — without this the down arrow gets pressed twice and a Short is
  skipped.
- `background.js` stores the on/off state in `chrome.storage.local` and
  updates the badge when the icon is clicked.
- Everything runs locally in your browser. The only permission used is
  `storage`.

## Testing

`test/harness/` simulates the Shorts player (looping fake videos, the
next-video button, and YouTube's real transition race). Serve the project
root and open the harness:

```bash
python3 -m http.server 8931 --directory /Users/umeshravuru/git/ugo_yt_shorts
```

Then open `http://localhost:8931/test/harness/index.html` (tests the live
`content.js`; expect `doubles: 0` and ~1s delays in `window.__result`) or
`...?v=old` (the frozen pre-fix script; reproduces the double-press).
# ugo_yt_shorts_auto_scroll
