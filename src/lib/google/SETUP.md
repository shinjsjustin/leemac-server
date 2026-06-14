# Google Workspace Setup for Jarvis

## 1. Google Cloud Console

### Enable APIs
In Google Cloud Console → APIs & Services → Library, enable:
- **Gmail API**
- **Google Calendar API**
- **Google People API** (for userinfo/profile)

### OAuth Consent Screen
- Go to APIs & Services → OAuth consent screen
- Set User Type to **Internal** (if using Google Workspace) or External
- Add scopes:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `openid`, `profile`, `email`

### Authorized Redirect URIs
Add these to your OAuth 2.0 Client ID (Credentials → OAuth 2.0 Client IDs):
- `http://localhost:3001/auth/google/callback` (existing login flow)
- `http://localhost:3001/api/jarvis/google/callback` (Jarvis Gmail flow)
- Your production equivalents, e.g. `https://leemac.co/api/jarvis/google/callback`

## 2. Environment Variables

Add to your `.env`:
```
CLIENT_ID=your-google-oauth-client-id
CLIENT_SECRET=your-google-oauth-client-secret
REDIRECT_URL=http://localhost:3001/auth/google/callback

# Optional override for the Jarvis-specific callback:
JARVIS_GOOGLE_REDIRECT_URL=http://localhost:3001/api/jarvis/google/callback
```

## 3. Connecting Gmail in the App

1. Log in as the owner admin
2. Navigate to `/jarvis` and click "Connect Google" (or hit `/api/jarvis/google/auth` directly)
3. Complete the Google consent screen — make sure to grant Gmail + Calendar permissions
4. You'll be redirected back to `/jarvis` with `?google_connected=1`

## 4. Existing Login Flow Note

The existing `oAuth.js` login requests `calendar` scope but not `gmail.readonly`. If you want Gmail
access persisted through the standard admin login, add the Gmail scope to `src/routes/oAuth.js`:
```js
scope: ['profile', 'email',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly'],
```
Otherwise the Jarvis `/google/auth` route handles this separately.
