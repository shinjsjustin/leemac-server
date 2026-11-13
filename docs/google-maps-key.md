# Google Maps key (IDEA-0060)

Google Maps is removed from leemac-server. `Address.js` and the `react-google-places-autocomplete` package are gone. `test/googleKeyGuard.test.js` and `test/package.test.js` now fail if a Google key or a Maps or Places package comes back.

## Action for Justin

The Maps browser key that `Address.js` held is still in public git history. The history is not rewritten, so the key stays readable there.

Delete the key, or at least restrict it, in the Google Cloud console under **APIs & Services**, **Credentials**. Find the Maps browser key (it starts with `AIza`) and delete it. If you keep it, limit it to the sites and APIs you still use.

## Deploy

No env var or deploy step is needed.
