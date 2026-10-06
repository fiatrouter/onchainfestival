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
const ticketPromoCode = (process.env.TICKET_PROMO_CODE || 'SLOWCO').trim().toUpperCase();
const ticketPromoDiscountPercent = Number(process.env.TICKET_PROMO_DISCOUNT_PERCENT || 10);
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
let ticketContacts;

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

function getCountryCode(request) {
  const country = request.get('x-vercel-ip-country') || request.get('cf-ipcountry');
  return typeof country === 'string' && /^[a-z]{2}$/i.test(country) && country.toUpperCase() !== 'XX'
    ? country.toUpperCase()
    : null;
}

function hasValidStatsToken(request) {
  return Boolean(statsToken && request.get('x-stats-token') === statsToken);
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
  ticketContacts = database.collection('ticketContacts');
  await Promise.all([
    events.createIndex({ createdAt: -1 }),
    events.createIndex({ eventType: 1, createdAt: -1 }),
    ticketContacts.createIndex({ flowId: 1 }, { unique: true }),
    ticketContacts.createIndex({ updatedAt: -1 })
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

function resolveTicketPromo(code) {
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!normalizedCode || !ticketPromoCode || normalizedCode !== ticketPromoCode) {
    return { error: 'That promo code is not valid.', status: 400 };
  }
  if (!Number.isFinite(ticketPromoDiscountPercent) || ticketPromoDiscountPercent <= 0 || ticketPromoDiscountPercent > 100) {
    return { error: 'Promo code discount is not configured correctly.', status: 503 };
  }
  return { code: ticketPromoCode, discountPercent: ticketPromoDiscountPercent };
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

app.post('/api/tickets/promo', (request, response) => {
  const promo = resolveTicketPromo(request.body?.promoCode);
  if (promo.error) return response.status(promo.status).json({ error: promo.error });
  return response.json({ code: promo.code, discountPercent: promo.discountPercent });
});

app.post('/api/tickets/checkout', async (request, response) => {
  if (!requireFrontdeskConfiguration(response)) return;

  const { tickets, contact, promoCode } = request.body || {};
  const normalizedPromoCode = typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : '';
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
  if (normalizedPromoCode) {
    const promo = resolveTicketPromo(normalizedPromoCode);
    if (promo.error) return response.status(promo.status).json({ error: promo.error });
  }

  try {
    const checkout = await frontdeskRequest(`/events/${encodeURIComponent(frontdeskEventSlug)}/checkout`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        tickets: normalizedTickets,
        ...(normalizedPromoCode ? { discountCode: ticketPromoCode } : {}),
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

app.post('/api/ticket-contacts', rateLimit, async (request, response) => {
  const { flowId, contact, guest, tickets, checkoutOpened } = request.body || {};
  if (typeof flowId !== 'string' || !/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(flowId)
    || !contact || typeof contact !== 'object'
    || typeof contact.name !== 'string' || !contact.name.trim()
    || contact.name.trim().length > 120
    || typeof contact.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())
    || contact.email.trim().length > 200
    || (contact.phone !== undefined && typeof contact.phone !== 'string')
    || (typeof contact.phone === 'string' && contact.phone.trim().length > 30)
    || (checkoutOpened !== undefined && typeof checkoutOpened !== 'boolean')
    || !Array.isArray(tickets) || !tickets.length || tickets.length > 20
    || tickets.some(ticket => !ticket || typeof ticket.ticketTypeRef !== 'string'
      || !ticket.ticketTypeRef.trim() || ticket.ticketTypeRef.length > 120
      || !Number.isInteger(ticket.quantity) || ticket.quantity < 1 || ticket.quantity > 20)
    || tickets.reduce((total, ticket) => total + ticket.quantity, 0) > 20) {
    return response.status(400).json({ error: 'Enter valid contact details and ticket selections.' });
  }

  const guestDetails = guest && typeof guest === 'object' ? {
    name: typeof guest.name === 'string' ? guest.name.trim() : '',
    email: typeof guest.email === 'string' ? guest.email.trim() : '',
    phone: typeof guest.phone === 'string' ? guest.phone.trim() : ''
  } : null;
  if (guestDetails && (guestDetails.name.length > 120 || guestDetails.email.length > 200
    || guestDetails.phone.length > 30)) {
    return response.status(400).json({ error: 'Guest details exceed the allowed length.' });
  }
  if (guestDetails?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDetails.email)) {
    return response.status(400).json({ error: 'Enter a valid guest email address.' });
  }

  const update = {
    $set: {
      name: contact.name.trim().slice(0, 120),
      email: contact.email.trim().slice(0, 200).toLowerCase(),
      phone: typeof contact.phone === 'string' ? contact.phone.trim().slice(0, 30) : '',
      guest: guestDetails,
      tickets: tickets.map(ticket => ({
        ticketTypeRef: ticket.ticketTypeRef.trim(),
        quantity: ticket.quantity
      })),
      country: getCountryCode(request),
      updatedAt: new Date()
    },
    $setOnInsert: {
      flowId,
      createdAt: new Date(),
      checkoutOpened: false
    }
  };
  if (checkoutOpened) update.$set.checkoutOpened = true;

  try {
    await ticketContacts.updateOne({ flowId }, update, { upsert: true });
    return response.status(204).end();
  } catch (error) {
    console.error('Ticket contact save failed:', error.message);
    return response.status(503).json({ error: 'Unable to save ticket follow-up details.' });
  }
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
      country: getCountryCode(request),
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
  if (!hasValidStatsToken(request)) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const [stats] = await events.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $facet: {
          summary: [
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
          ],
          countries: [
            { $match: { eventType: 'page_view', country: { $type: 'string' } } },
            {
              $group: {
                _id: '$country',
                pageViews: { $sum: 1 },
                visitors: { $addToSet: '$visitorId' }
              }
            },
            {
              $project: {
                _id: 0,
                country: '$_id',
                pageViews: 1,
                uniqueVisitors: { $size: '$visitors' }
              }
            },
            { $sort: { uniqueVisitors: -1, pageViews: -1, country: 1 } }
          ]
        }
      }
    ]).toArray();
    const summary = stats?.summary?.[0];

    return response.json({
      period: { from: since.toISOString(), to: new Date().toISOString() },
      pageViews: summary?.pageViews || 0,
      uniqueVisitors: summary?.uniqueVisitors || 0,
      registrationClicks: summary?.registrationClicks || 0,
      countries: stats?.countries || []
    });
  } catch (error) {
    console.error('Stats read failed:', error.message);
    return response.status(503).json({ error: 'Stats unavailable' });
  }
});

app.get('/api/stats/ticket-contacts', async (request, response) => {
  if (!hasValidStatsToken(request)) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const contacts = await ticketContacts.find({}, {
      projection: {
        _id: 0,
        name: 1,
        email: 1,
        phone: 1,
        guest: 1,
        tickets: 1,
        country: 1,
        checkoutOpened: 1,
        createdAt: 1,
        updatedAt: 1
      }
    }).sort({ updatedAt: -1 }).limit(500).toArray();
    return response.json({ contacts });
  } catch (error) {
    console.error('Ticket contact read failed:', error.message);
    return response.status(503).json({ error: 'Ticket contacts unavailable' });
  }
});

app.get('/api/stats/ticket-contacts.csv', async (request, response) => {
  if (!hasValidStatsToken(request)) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const csvValue = value => {
    const text = String(value ?? '');
    const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  };
  try {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="onchain-festival-ticket-contacts.csv"');
    response.write('Name,Email,Phone,Guest name,Guest email,Guest phone,Tickets,Country,Checkout opened,First captured,Last updated\r\n');
    const cursor = ticketContacts.find({}, {
      projection: {
        name: 1,
        email: 1,
        phone: 1,
        guest: 1,
        tickets: 1,
        country: 1,
        checkoutOpened: 1,
        createdAt: 1,
        updatedAt: 1
      }
    }).sort({ updatedAt: -1 });

    for await (const contact of cursor) {
      const row = [
        contact.name,
        contact.email,
        contact.phone,
        contact.guest?.name,
        contact.guest?.email,
        contact.guest?.phone,
        (contact.tickets || []).map(ticket => `${ticket.ticketTypeRef} x${ticket.quantity}`).join('; '),
        contact.country,
        contact.checkoutOpened ? 'Yes' : 'No',
        contact.createdAt?.toISOString(),
        contact.updatedAt?.toISOString()
      ].map(csvValue).join(',');
      if (!response.write(`${row}\r\n`)) {
        await new Promise(resolve => response.once('drain', resolve));
      }
    }
    return response.end();
  } catch (error) {
    console.error('Ticket contact export failed:', error.message);
    if (response.headersSent) return response.destroy(error);
    return response.status(503).json({ error: 'Ticket contacts unavailable' });
  }
});

app.get('/', (request, response) => {
  response.sendFile(path.join(staticRoot, 'index.html'));
});

app.get('/tickets', (request, response) => {
  response.redirect('/?tickets=1#tickets');
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