// Service worker registration — loaded as external script to avoid unsafe-inline CSP
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(function () {});
}
