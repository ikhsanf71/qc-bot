const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY   // pakai service_role key → bypass RLS
);

module.exports = supabase;