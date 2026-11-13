// Client Supabase per le segnalazioni. Usa solo URL e chiave "publishable" (pubbliche per natura), mai la chiave segreta.
// Senza le variabili VITE_SUPABASE_* (build senza configurazione) il client è null e la sezione segnalazioni non compare.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chiave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && chiave ? createClient(url, chiave) : null;
