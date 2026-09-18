require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || 'onchainfestival';
const statsToken = process.env.STATS_TOKEN;
const frontdeskApiKey = process.env.FRONTDESK_SECRET_KEY || process.env.FRONTDESK_API_KEY;
const frontdeskEventSlug = process.env.FRONTDESK_EVENT_SLUG;
const frontdeskWebhookSecret = process.env.FRONTDESK_WEBHOOK_SECRET;
const frontdeskBaseUrl = 'https://api.frontdesk.africa/v1/store';
const staticRoot = __dirname;

if (!mongoUri) {
  throw new Error('MONGODB_URI is required');
}

const mongoClient = new MongoClient(mongoUri, {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000
});
let events;

const rateBuckets = new Map();
function rateLimit(request, response, next) {
  const address = request.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(address);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    rateBuckets.set(address, { startedAt: now, count: 1 });
    return next();
  }
  if (bucket.count >= 120) return response.status(429).end();
  bucket.count += 1;
  next();
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({
  limit: '4kb',
  type: 'application/json',
  verify(request, response, buffer) {
    request.rawBody = buffer;
  }
}));

let databaseReady;
async function initializeDatabase() {
  await mongoClient.connect();
  const database = mongoClient.db(databaseName);
  events = database.collection('events');
  await Promise.all([
    events.createIndex({ createdAt: -1 }),
    events.createIndex({ eventType: 1, createdAt: -1 })
  ]);
}

function ensureDatabase(request, response, next) {
  if (!databaseReady) {
    databaseReady = initializeDatabase();
  }

  databaseReady.then(() => next()).catch((error) => {
    console.error('Database connection failed:', error.message);
    databaseReady = undefined;
    response.status(503).json({ error: 'Tracking service unavailable' });
  });
}

function requireFrontdeskConfiguration(response) {
  if (!frontdeskApiKey || !frontdeskEventSlug || frontdeskApiKey.startsWith('fd_pk_')) {
    response.status(503).json({
      error: 'Frontdesk checkout is not configured. Set FRONTDESK_SECRET_KEY and FRONTDESK_EVENT_SLUG.'
    });
    return false;
  }
  return true;
}

async function frontdeskRequest(url, options = {}) {
  const frontdeskResponse = await fetch(`${frontdeskBaseUrl}${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${frontdeskApiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const body = await frontdeskResponse.json().catch(() => ({}));
  if (!frontdeskResponse.ok) {
    const error = new Error(body?.error?.message || 'Frontdesk request failed');
    error.status = frontdeskResponse.status;
    error.body = body;
    throw error;
  }
  return body;
}

app.post('/api/frontdesk/webhook', (request, response) => {
  const timestamp = request.get('x-fd-timestamp');
  const signature = request.get('x-fd-signature');
  const timestampNumber = Number(timestamp);
  if (!frontdeskWebhookSecret || !request.rawBody || !timestamp || !signature || !Number.isFinite(timestampNumber)
    || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
    return response.status(401).json({ error: 'Invalid webhook signature' });
  }

  const expectedSignature = `sha256=${crypto.createHmac('sha256', frontdeskWebhookSecret)
    .update(`${timestamp}.${request.rawBody.toString('utf8')}`)
    .digest('hex')}`;
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return response.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = request.body || {};
  console.info('Frontdesk webhook received:', event.type || event.event, event.checkoutRef || event.orderRef || event.attendeeRef || '');
  return response.status(204).end();
});

app.get('/api/tickets/event', async (request, response) => {
  if (!requireFrontdeskConfiguration(response)) return;

  try {
    const event = await frontdeskRequest(`/events/${encodeURIComponent(frontdeskEventSlug)}`);
    return response.json({
      slug: event.slug,
      name: event.name,
      ticketTypes: (event.ticketTypes || []).filter(ticketType => !ticketType.hidden)
    });
  } catch (error) {
    console.error('Frontdesk event read failed:', error.message);
    if (error.status === 404) {
      return response.status(503).json({
        error: `The Frontdesk event "${frontdeskEventSlug}" is not published. Publish the event in Frontdesk and update FRONTDESK_EVENT_SLUG.`
      });
    }
    return response.status(error.status || 502).json({ error: 'Ticket information unavailable' });
  }
});

app.post('/api/tickets/checkout', async (request, response) => {
  if (!requireFrontdeskConfiguration(response)) return;

  const { tickets, contact } = request.body || {};
  const requestedTickets = Array.isArray(tickets) ? tickets : [];
  const normalizedTickets = requestedTickets.map(ticket => ({
    ticketTypeRef: ticket?.ticketTypeRef,
    quantity: Number(ticket?.quantity)
  }));
  const totalQuantity = normalizedTickets.reduce((total, ticket) => total + ticket.quantity, 0);
  if (!normalizedTickets.length || normalizedTickets.some(ticket => typeof ticket.ticketTypeRef !== 'string' || !ticket.ticketTypeRef
    || !Number.isInteger(ticket.quantity) || ticket.quantity < 1 || ticket.quantity > 20)
    || totalQuantity > 20) {
    return response.status(400).json({ error: 'Choose valid tickets and quantities.' });
  }
  if (!contact || typeof contact.name !== 'string' || !contact.name.trim() || typeof contact.email !== 'string' || !contact.email.includes('@')) {
    return response.status(400).json({ error: 'Enter your name and a valid email address.' });
  }

  try {
    const checkout = await frontdeskRequest(`/events/${encodeURIComponent(frontdeskEventSlug)}/checkout`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        tickets: normalizedTickets,
        contact: {
          name: contact.name.trim().slice(0, 120),
          email: contact.email.trim().slice(0, 200),
          ...(typeof contact.phone === 'string' && contact.phone.trim() ? { phone: contact.phone.trim().slice(0, 30) } : {})
        },
        returnUrl: `${request.protocol}://${request.get('host')}/?tickets=complete`
      })
    });
    return response.json({ hostedUrl: checkout.hostedUrl });
  } catch (error) {
    console.error('Frontdesk checkout failed:', error.message);
    return response.status(error.status || 502).json({ error: error.body?.error?.message || 'Unable to open ticket checkout.' });
  }
});

app.use('/api', (request, response, next) => {
  if (request.path === '/frontdesk/webhook') return next();
  return ensureDatabase(request, response, next);
});

app.post('/api/track', rateLimit, async (request, response) => {
  const { eventType, visitorId, path: pagePath, referrer, buttonText } = request.body || {};
  const validEventTypes = new Set(['page_view', 'registration_click']);

  if (!validEventTypes.has(eventType) || typeof visitorId !== 'string' || visitorId.length > 80) {
    return response.status(400).json({ error: 'Invalid tracking event' });
  }

  try {
    await events.insertOne({
      eventType,
      visitorId,
      path: typeof pagePath === 'string' ? pagePath.slice(0, 200) : '/',
      referrer: typeof referrer === 'string' ? referrer.slice(0, 500) : null,
      buttonText: eventType === 'registration_click' && typeof buttonText === 'string'
        ? buttonText.slice(0, 80)
        : null,
      createdAt: new Date()
    });
    return response.status(204).end();
  } catch (error) {
    console.error('Tracking write failed:', error.message);
    return response.status(204).end();
  }
});

app.get('/api/stats', async (request, response) => {
  if (!statsToken || request.get('x-stats-token') !== statsToken) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const [summary] = await events.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          pageViews: { $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] } },
          registrationClicks: { $sum: { $cond: [{ $eq: ['$eventType', 'registration_click'] }, 1, 0] } },
          visitors: { $addToSet: '$visitorId' }
        }
      },
      {
        $project: {
          _id: 0,
          pageViews: 1,
          registrationClicks: 1,
          uniqueVisitors: { $size: '$visitors' }
        }
      }
    ]).toArray();

    return response.json({
      period: { from: since.toISOString(), to: new Date().toISOString() },
      pageViews: summary?.pageViews || 0,
      uniqueVisitors: summary?.uniqueVisitors || 0,
      registrationClicks: summary?.registrationClicks || 0
    });
  } catch (error) {
    console.error('Stats read failed:', error.message);
    return response.status(503).json({ error: 'Stats unavailable' });
  }
});

app.get('/', (request, response) => {
  response.sendFile(path.join(staticRoot, 'index.html'));
});

app.get('/old.html', (request, response) => {
  response.redirect('/');
});

app.use(express.static(staticRoot, {
  extensions: ['html'],
  index: 'index.html',
  setHeaders(response, filePath) {
    if (filePath.includes(`${path.sep}moments${path.sep}`)) {
      response.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
  }
}));

async function start() {
  await initializeDatabase();
  app.listen(port, () => console.log(`Onchain Festival running on http://localhost:${port}`));
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  start().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

process.on('SIGINT', async () => {
  await mongoClient.close();
  process.exit(0);
});