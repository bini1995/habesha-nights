const amcProvider = require("./amc");

const providers = Object.freeze({
  AMC: amcProvider
});

function normalizeProviderName(provider) {
  if (!provider || typeof provider !== "string") {
    throw new Error("A watch provider is required.");
  }

  return provider.trim().toUpperCase();
}

function getProvider(provider) {
  const normalizedProvider =
    normalizeProviderName(provider);
  const selectedProvider = providers[normalizedProvider];

  if (!selectedProvider) {
    throw new Error(
      `Unsupported watch provider: "${provider}".`
    );
  }

  return selectedProvider;
}

function getSupportedProviders() {
  return Object.keys(providers);
}

module.exports = {
  getProvider,
  getSupportedProviders
};
