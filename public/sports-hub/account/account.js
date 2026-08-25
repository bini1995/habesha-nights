const statusTitle = document.querySelector("#account-status-title");
const statusCopy = document.querySelector("#account-status-copy");
const statusBadge = document.querySelector("#account-status-badge");
const setupPanel = document.querySelector("#account-setup");
const signInPanel = document.querySelector("#account-signin");
const verifyPanel = document.querySelector("#account-verify");
const signedInPanel = document.querySelector("#account-signed-in");
const emailForm = document.querySelector("#email-form");
const verifyForm = document.querySelector("#verify-form");
const emailInput = document.querySelector("#account-email");
const codeInput = document.querySelector("#account-code");
const emailStatus = document.querySelector("#email-status");
const verifyStatus = document.querySelector("#verify-status");
const signedInStatus = document.querySelector("#signed-in-status");

let authClient = null;
let activeEmail = "";

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}

function setVisible(panel) {
  [setupPanel, signInPanel, verifyPanel, signedInPanel].forEach((item) => {
    item.hidden = item !== panel;
  });
}

function showLocalMode(configurationError = null) {
  statusTitle.textContent = configurationError
    ? "Account settings need attention."
    : "Local Sports Hub is ready.";
  statusCopy.textContent = configurationError ??
    "Hosted accounts are waiting for the private staging settings. Your existing local features are unchanged.";
  statusBadge.textContent = configurationError ? "Setup issue" : "Local mode";
  statusBadge.classList.remove("ready");
  setVisible(setupPanel);
}

function showSignedOut() {
  statusTitle.textContent = "Hosted sign-in is ready.";
  statusCopy.textContent =
    "Sign in by email to verify your identity for the private beta.";
  statusBadge.textContent = "Beta ready";
  statusBadge.classList.add("ready");
  setVisible(signInPanel);
}

async function verifiedUser(session) {
  if (!session?.access_token) return null;
  try {
    const body = await requestJson("/api/sports-hub/auth/me", {
      headers: { authorization: `Bearer ${session.access_token}` }
    });
    return body.user;
  } catch {
    return null;
  }
}

async function showSession(session) {
  const user = await verifiedUser(session);
  if (!user) {
    showSignedOut();
    return;
  }
  statusTitle.textContent = "Your identity is verified.";
  statusCopy.textContent =
    "This session is ready for the hosted league database once staging policies are deployed.";
  statusBadge.textContent = "Signed in";
  statusBadge.classList.add("ready");
  document.querySelector("#account-user-email").textContent =
    user.email ?? "Verified Sports Hub account";
  setVisible(signedInPanel);
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  emailStatus.textContent = "Sending your private sign-in email…";
  activeEmail = emailInput.value.trim().toLowerCase();
  const button = emailForm.querySelector("button");
  button.disabled = true;
  try {
    const { error } = await authClient.auth.signInWithOtp({
      email: activeEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/sports-hub/account/`,
        shouldCreateUser: true
      }
    });
    if (error) throw error;
    document.querySelector("#verify-copy").textContent =
      `We sent a private sign-in email to ${activeEmail}. Open its link, or enter the code shown in the message.`;
    emailStatus.textContent = "Email sent.";
    setVisible(verifyPanel);
    codeInput.focus();
  } catch (error) {
    emailStatus.textContent = error.message || "The sign-in email could not be sent.";
  } finally {
    button.disabled = false;
  }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  verifyStatus.textContent = "Verifying your code…";
  const button = verifyForm.querySelector("button");
  button.disabled = true;
  try {
    const token = codeInput.value.replace(/\s/g, "");
    const { data, error } = await authClient.auth.verifyOtp({
      email: activeEmail,
      token,
      type: "email"
    });
    if (error) throw error;
    await showSession(data.session);
  } catch (error) {
    verifyStatus.textContent = error.message || "That code could not be verified.";
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#change-email").addEventListener("click", () => {
  verifyStatus.textContent = "";
  codeInput.value = "";
  setVisible(signInPanel);
  emailInput.focus();
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  signedInStatus.textContent = "Signing out…";
  const { error } = await authClient.auth.signOut({ scope: "local" });
  if (error) {
    signedInStatus.textContent = error.message || "Sign out failed.";
    return;
  }
  signedInStatus.textContent = "";
  showSignedOut();
});

async function initialize() {
  try {
    const configuration = await requestJson("/api/sports-hub/auth/config");
    if (!configuration.configured) {
      showLocalMode(configuration.configurationError);
      return;
    }
    if (!window.supabase?.createClient) {
      throw new Error("The secure account client did not load.");
    }
    authClient = window.supabase.createClient(
      configuration.url,
      configuration.publishableKey,
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          persistSession: true
        }
      }
    );
    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    await showSession(data.session);
    authClient.auth.onAuthStateChange((event, session) => {
      if (["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED"].includes(event)) {
        window.setTimeout(() => showSession(session), 0);
      }
    });
  } catch (error) {
    statusTitle.textContent = "Account setup needs attention.";
    statusCopy.textContent = error.message || "The hosted account service is unavailable.";
    statusBadge.textContent = "Unavailable";
    setVisible(setupPanel);
  }
}

initialize();
