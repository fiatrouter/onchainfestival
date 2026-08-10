require('dotenv').config();

const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || 'onchainfestival';
const statsToken = process.env.STATS_TOKEN;
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
app.use(express.json({ limit: '4kb', type: 'application/json' }));

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

app.use(express.static(staticRoot, { extensions: ['html'], index: 'index.html' }));

async function start() {
  await mongoClient.connect();
  const database = mongoClient.db(databaseName);
  events = database.collection('events');
  await events.createIndex({ createdAt: -1 });
  await events.createIndex({ eventType: 1, createdAt: -1 });
  app.listen(port, () => console.log(`Onchain Festival running on http://localhost:${port}`));
}

start().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await mongoClient.close();
  process.exit(0);
});