# LeadFlow email OAuth setup (private beta)

The LeadFlow application implements provider authorization and explicit send confirmation, but it **cannot send email until both providers are registered**. Never commit credentials to GitHub, HTML, or screenshots.

## Redirect URI (both providers)
`https://leadflow-research-api.onrender.com/oauth/callback`

## Google / Gmail
1. In Google Cloud Console, create/select a project. Configure the OAuth consent screen and choose External or Internal as appropriate.
2. In the consent configuration, request only `https://www.googleapis.com/auth/gmail.send`. Gmail send is a sensitive scope; public production access may require verification. For private testing, add authorized test users and respect testing-mode limitations.
3. Enable the Gmail API. Create an **OAuth Client ID** of type **Web application**. Add the redirect URI above exactly. Use the LeadFlow frontend URL as an authorized JavaScript origin if required by the provider setup.
4. In Render **backend service** environment settings, add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

## Microsoft / Outlook / Microsoft 365
1. In Microsoft Entra admin center > App registrations, register a new app. Choose supported account types appropriate to the intended users, including personal Microsoft accounts if desired.
2. Add a **Web** redirect URI exactly matching the URL above.
3. Add delegated Microsoft Graph permission `Mail.Send` (and `User.Read` if needed for sign-in); the app requests `offline_access Mail.Send User.Read`.
4. Create a client secret, and add `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` to the Render **backend service** environment settings. Microsoft tenant policies may require administrator consent.

## Render
- Backend service: `srv-dbkhlo7b9u1s73bffq40`.
- `PUBLIC_API_ORIGIN=https://leadflow-research-api.onrender.com`
- `ALLOWED_ORIGIN=https://leadflow-tp57.onrender.com`
- Keep all four OAuth credentials **only in private backend environment variables**. Do not set these in frontend Render service or commit them.
- Deploy/restart backend after configuration. Click Connect Gmail or Connect Microsoft 365 in LeadFlow and authorize using a test account.
- Send one explicitly confirmed test email to an address you own, and verify both the provider Sent folder and recipient inbox.
- Free-tier use may be subject to provider verification, quotas, or tenant policies.

## Security notes
- Current session and OAuth state are held **in backend process memory**; a Render restart invalidates them. Do not use this beta implementation for unattended sending.
- Do not treat an accepted API send as guaranteed inbox delivery.
- Only use contact addresses obtained and used in compliance with applicable anti-spam laws and provider policies.
