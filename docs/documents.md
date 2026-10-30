# Documents (server-rendered PDFs)

## What changed

- Five documents (Quote, Order, Invoice, Packing list, Shipping label) are now rendered on the server from the job's data, using the templates in `src/lib/documents/`.
- The Job page has a Documents panel. Level 3 admins see **Make PDF** per document. All admins see Download PDF and Print for the latest made file.
- Made files are saved to the job's files and named `...-site.pdf`, beside the files the old Export creates.
- The shipping label is 4x6 in; the others are Letter.
- **Make PDF answers 503 until Puppeteer is installed.** The server boots fine without it.

## Before deploy (on branch `idea-0040`)

The agents could not install Puppeteer (no network). Do it once:

```
npm install puppeteer
node --test test/documents/pdfRenderer.test.js
```

The second command runs the real-render test, which only runs once Puppeteer exists. Then commit `package.json` and `package-lock.json`.

## Deploy

No migration is needed.

1. On the server, check memory: `free -h`. If under about 1 GB is free, add 2 GB swap (or plan to move rendering to the Mac instead):

   ```
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

2. Run `npm install` so Puppeteer downloads Chromium.
3. Install Chromium's Ubuntu libraries (from Puppeteer's troubleshooting page). On Ubuntu 24.04 `libasound2` is named `libasound2t64`.

   ```
   sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
     libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
     libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
     libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
     libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
     libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
     lsb-release wget xdg-utils
   ```

4. Deploy the server and the client.

## Browser checklist

- [ ] Make PDF works for each type: Quote, Order, Invoice, Packing list, Shipping label.
- [ ] Compare each with the old Export output for the same job.
- [ ] Download PDF and Print work on each made file.
- [ ] Packing list prints the right number of copies.
- [ ] The shipping label prints at 4x6.
- [ ] A job with over 10 parts renders correctly (page breaks, nothing cut off).
- [ ] The ship date comes from the job.
- [ ] A level 1 admin sees no Make PDF button (Download PDF and Print still show).

## Unchanged

The old Export, Populate Google Sheet, Drive and `print.py` keep working. No migration is needed.
