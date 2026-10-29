# Google Workspace Setup for Connect Google

## 1. Google Cloud Console

### Enable APIs
In Google Cloud Console → APIs & Services → Library, enable:
- **Gmail API**
- **Google People API** (for userinfo/profile)

### OAuth Consent Screen
- Go to APIs & Services → OAuth consent screen
- Set User Type to **Internal** (if using Google Workspace) or External
- Add scopes:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `openid`, `profile`, `email`

### Authorized Redirect URIs
Add these to your OAuth 2.0 Client ID (Credentials → OAuth 2.0 Client IDs):
- `http://localhost:3001/auth/google/callback` (existing login flow)
- `http://localhost:3001/api/jarvis/google/callback` (Connect Google flow)
- Your production equivalents, e.g. `https://leemac.co/api/jarvis/google/callback`

## 2. Environment Variables

Add to your `.env`:
```
CLIENT_ID=your-google-oauth-client-id
CLIENT_SECRET=your-google-oauth-client-secret
REDIRECT_URL=http://localhost:3001/auth/google/callback

# Optional override for the Connect Google callback:
JARVIS_GOOGLE_REDIRECT_URL=http://localhost:3001/api/jarvis/google/callback
```

## 3. Connecting Gmail in the App

1. Log in as the owner admin (access level 3)
2. Open Settings and click "Connect Google" (or hit `/api/jarvis/google/auth` directly)
3. Complete the Google consent screen and grant Gmail read access
4. You'll be redirected back to `/settings` with `?google_connected=1`, or `?google_error=1` on failure

> **After deploying a scope change**: the owner must disconnect and re-connect Google. Existing
> tokens do not carry newly-added scopes. Tokens that still carry the old compose and calendar
> scopes keep working; Google only grants the reduced set on the next consent.

Use "Check Gmail" in Settings (`/api/jarvis/google/check`) to confirm the connection.
