/* ============================= SUPABASE CONFIG =============================
   Paste your values from Supabase → Settings → API, then re-upload to Netlify.
============================================================================ */
const SUPABASE_URL = 'https://xprpkuekemdskexecbxz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TiqcIZypUTQ3sBHImEOoLQ_0aN85nBE';
const sb = (SUPABASE_URL.startsWith('http')) ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;