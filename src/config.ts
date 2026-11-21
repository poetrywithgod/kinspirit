// Public settings. The Supabase "publishable" key is designed to sit in the app;
// what protects data is the row-level security set up in supabase/schema.sql.
// Never put the secret / service_role key here.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://mxdvsqmguhjdpoijmcxg.supabase.co'

export const SUPABASE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_5u2QYO-g6-FVzlCkW5tfKA_nNUBjKO0'

/** Kinspirit's WhatsApp number, international format without "+". */
export const WHATSAPP_NUMBER: string = import.meta.env.VITE_KINSPIRIT_WHATSAPP ?? '2347053412256'

/** Digits in the emailed code. Must match Supabase: Authentication > Sign In / Providers > Email > OTP length. */
export const EMAIL_OTP_LENGTH: number = Number(import.meta.env.VITE_EMAIL_OTP_LENGTH ?? 8)
