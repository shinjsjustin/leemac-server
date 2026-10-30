# Print agent

Runs on the shop Mac. Long-polls the server for print jobs and prints them with `lp`. Replaces `print.py`. Needs Node 23 or later and no npm packages.

## Install

1. Open the Printers page in the app and generate an agent token. It is shown once.
2. Copy `com.leemac.printagent.plist` to `~/Library/LaunchAgents/`.
3. Edit the copy. Replace every `CHANGE_ME`: the Node path, the path to `agent.js`, your user name in the log paths, `PRINT_AGENT_URL` (the server address) and `PRINT_AGENT_TOKEN` (the token from step 1).
4. Load it:

```
launchctl load ~/Library/LaunchAgents/com.leemac.printagent.plist
```

## Unload

```
launchctl unload ~/Library/LaunchAgents/com.leemac.printagent.plist
```

Unload and load again after editing the plist or rotating the token.

## Logs

```
tail -f ~/Library/Logs/printagent.log
```

## Run by hand

```
PRINT_AGENT_URL=https://... PRINT_AGENT_TOKEN=... node tools/print-agent/agent.js
```
