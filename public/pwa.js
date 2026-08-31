let deferredInstallPrompt = null;

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function installDialog() {
  let dialog = document.querySelector("#install-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "install-dialog";
  dialog.className = "install-dialog";
  dialog.innerHTML = `<button class="close" type="button" aria-label="Close install instructions">×</button>
    <p class="eyebrow dark">Habesha Nights on your phone</p>
    <h2>Add the app to your home screen.</h2>
    <div data-install-copy></div>`;
  dialog.querySelector(".close").addEventListener("click", () => dialog.close());
  document.body.append(dialog);
  return dialog;
}

function updateInstallButtons() {
  const available = !standaloneMode() && (Boolean(deferredInstallPrompt) || isIos());
  document.querySelectorAll("[data-install-app]").forEach((button) => {
    button.hidden = !available;
    button.textContent = isIos() ? "Add to iPhone" : "Get the app";
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtons();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallButtons();
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-install-app]");
  if (!button) return;
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButtons();
    return;
  }
  const dialog = installDialog();
  dialog.querySelector("[data-install-copy]").innerHTML = isIos()
    ? `<ol class="install-steps"><li>Open Habesha Nights in Safari.</li><li>Tap the Share button.</li><li>Choose <strong>Add to Home Screen</strong>, then tap Add.</li></ol>`
    : `<p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>`;
  dialog.showModal();
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
updateInstallButtons();
