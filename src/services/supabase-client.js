const { createClient } = require("@supabase/supabase-js");

function createSupabaseClient(config) {
  if (!config.databaseConfigured) return null;
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = { createSupabaseClient };
