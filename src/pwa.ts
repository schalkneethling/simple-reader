const serviceWorkerUrl = "/service-worker.js";

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    void Promise.resolve(navigator.serviceWorker.register(serviceWorkerUrl, { scope: "/" })).catch(
      () => undefined,
    );
  };

  if (document.readyState === "loading") {
    window.addEventListener("load", register, { once: true });
    return;
  }

  register();
}
