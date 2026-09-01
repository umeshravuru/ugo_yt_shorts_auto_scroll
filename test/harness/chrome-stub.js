// Minimal chrome.* stub so content.js can run outside an extension,
// with the toggle forced ON.
window.chrome = {
  runtime: { id: "harness" },
  storage: {
    local: { get: async () => ({ enabled: true }) },
    onChanged: { addListener: () => {} },
  },
};
