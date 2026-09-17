/**
 * Single guarded registrar for the offline service worker.
 * Never registers in dev, inside an iframe, in Lovable preview hosts, or with ?sw=off.
 */
const SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL ?? r.waiting?.scriptURL ?? "").endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

export function registerOfflineWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    void unregisterAppWorkers();
    return;
  }
  void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
    /* offline support is optional; ignore registration failures */
  });
}
