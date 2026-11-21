# Kinspirit

A chat and meetings app for communities, built as an installable web app (PWA), starting in Nigeria.
Light on data. Made with React, Vite, TypeScript and Supabase.

## Run it

```
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173) and use your browser's phone view.

## What works today

- Welcome, sign up and log in screens (light and dark mode follow the phone)
- Email sign-up with an emailed code, or a "Confirm my email" link
- Phone confirmation screen (WhatsApp code, SMS fallback) - **still a stand-in**, see below
- Username check and profile photo with a crop, zoom and rotate step
- Signed-in home with logo top left, avatar top right, and log out
- Saved log-in: reopening the app goes straight to home

## Supabase setup (once per project)

1. **Database:** SQL Editor, paste all of `supabase/schema.sql`, run it.
2. **SMTP:** Authentication, Emails, SMTP Settings. Turn on custom SMTP (Brevo, Resend, etc.).
3. **Email text:** Authentication, Emails, "Confirm signup". Use:
   ```
   <h2>Your Kinspirit code</h2>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Or tap to confirm instantly: <a href="{{ .ConfirmationURL }}">Confirm my email</a></p>
   ```
4. **URLs:** Authentication, URL Configuration. Set Site URL to the address the app runs on and add it under Redirect URLs.
5. **Code length:** the app expects 8-digit email codes (`EMAIL_OTP_LENGTH` in `src/config.ts`). Match the Supabase setting.

## Settings

Defaults live in `src/config.ts`. To override, copy `.env.example` to `.env`:

| Variable | Meaning |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (safe in the app) |
| `VITE_KINSPIRIT_WHATSAPP` | WhatsApp number for phone confirmation, without "+" |
| `VITE_EMAIL_OTP_LENGTH` | Digits in the emailed code |

Never put the Supabase secret / `service_role` key in this project.

## Where things are

- `src/App.tsx` - screens and routing
- `src/api.ts` - the only place the app talks to the server
- `src/supabase.ts` - small Supabase client (plain fetch, no extra package)
- `src/screens/` - email code, phone, profile
- `src/PhotoCropper.tsx` - photo crop, zoom and rotate
- `public/pattern.svg` - the background pattern tile
- `supabase/schema.sql` - database, permissions and photo storage

## Still a stand-in

Phone confirmation does not check anything yet. It needs a server function that receives the WhatsApp
message and marks `profiles.phone_verified`. Until then, "I have sent it" always passes.
