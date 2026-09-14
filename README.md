.# Onchain Festival tracker.

The site records page views and clicks on `.frontdesk-cta-button` through a same-origin Node endpoint. Ticket checkout is opened server-side through Frontdesk; secret credentials are used only by `server.js` and are never sent to the browser.

## Run locally (Windows PowerShell)

1. Replace `STATS_TOKEN="generate-a-long-random-secret"` in `.env` with a private random value. Keep the MongoDB connection string in that file.
2. Add the Frontdesk server secret and event slug to `.env`:

   ```text
   FRONTDESK_SECRET_KEY="fd_sk_live_your_server_only_key"
   FRONTDESK_EVENT_SLUG="your-frontdesk-event-slug"
   FRONTDESK_WEBHOOK_SECRET="your-frontdesk-webhook-signing-secret"
   ```

   `FRONTDESK_API_KEY` values beginning with `fd_pk_` are publishable keys and cannot open paid checkouts. Never put an `fd_sk_` key in frontend code.
   In Frontdesk, add `https://onchainfestival.org/api/frontdesk/webhook` as the webhook destination and copy its signing secret into `FRONTDESK_WEBHOOK_SECRET`.

3. In this folder, install dependencies once:

   ```powershell
   npm install
   ```

4. Start the server and leave this terminal open:

   ```powershell
   npm start
   ```

5. Open these URLs in your browser. Do not double-click the HTML files or open them with a `file:///` URL:

   - Site: `http://localhost:3000/`
   - Dashboard: `http://localhost:3000/stats.html`

6. Enter the exact same value used for `STATS_TOKEN` in `.env`, then select **Load stats**. Stop the server with `Ctrl+C`.

If the dashboard says `Unable to load stats`, confirm the address starts with `http://localhost:3000` and restart `npm start` after changing `.env`.

The stats endpoint reports the last 30 days: unique visitors, page views, and registration CTA clicks. It stores a random browser visitor ID, event metadata, and timestamps; raw IP addresses are used only in memory for rate limiting and are not stored.

Before deploying, configure HTTPS, set a long random `STATS_TOKEN`, restrict the MongoDB Atlas network access list to the hosting provider, and use a least-privilege MongoDB database user.
