// Shorts Auto-Scroll — service worker.
// Holds the on/off state in chrome.storage.local and toggles it when the
// toolbar icon is clicked. The badge mirrors the current state.

async function getEnabled() {
  const { enabled = false } = await chrome.storage.local.get("enabled");
  return enabled === true;
}

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#0f9d58" : "#5f6368" });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === undefined) {
    await chrome.storage.local.set({ enabled: false });
  }
  updateBadge(enabled === true);
});

chrome.runtime.onStartup.addListener(async () => {
  updateBadge(await getEnabled());
});

chrome.action.onClicked.addListener(async () => {
  const enabled = !(await getEnabled());
  await chrome.storage.local.set({ enabled });
  updateBadge(enabled);
});
