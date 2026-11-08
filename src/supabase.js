import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Cliente con la clave pública: solo para login/refresh. Uno por llamada para no compartir sesión. */
export const anonClient = () => createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, opts);

/** Cliente con la clave secreta (service role): solo para crear/editar usuarios. NUNCA exponerla. */
export const adminClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, opts);
