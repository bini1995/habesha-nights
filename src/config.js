function readConfig(environment = process.env) {
  const supabaseUrl = environment.SUPABASE_URL?.trim() || null;
  const supabaseSecretKey = environment.SUPABASE_SECRET_KEY?.trim()
    || environment.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || null;

  return Object.freeze({
    port: Number(environment.PORT || 3000),
    supabaseUrl,
    supabaseSecretKey,
    databaseConfigured: Boolean(supabaseUrl && supabaseSecretKey),
    adminToken: environment.ADMIN_TOKEN?.trim() || null,
    clickHashSalt: environment.CLICK_HASH_SALT?.trim() || environment.ADMIN_TOKEN?.trim() || null,
    flyerBucket: environment.SUPABASE_FLYER_BUCKET?.trim() || "event-flyers"
  });
}

module.exports = { readConfig };
