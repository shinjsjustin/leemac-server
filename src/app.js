const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const internalRoutes = require('./routes/internal');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const clientPortalRoutes = require('./routes/clientPortal');
const portalRoutes = require('./routes/portal');
const portalRequestsRoutes = require('./routes/portalRequests');
const portalListsRoutes = require('./routes/portalLists');
const portalNotesRoutes = require('./routes/portalNotes');
const portalQcRoutes = require('./routes/portalQc');
const bourneRoutes = require('./routes/bourne');
const bourneWriteRoutes = require('./routes/bourne/write');
const { createPrintAgentRouter } = require('./routes/printAgent');

const cors = require('cors');
const app = express();

// Trust the first proxy hop in production so rate-limiters (express-rate-limit)
// see real client IPs rather than the proxy's IP.
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

const isAuth = require('./middleware/isAuth');

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
    exposedHeaders: ['Retry-After', 'RateLimit-Reset']
}));
app.use(bodyParser.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.use('/api/internal', isAuth, internalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client/portal', isAuth, clientPortalRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/portal-requests', portalRequestsRoutes);
app.use('/api/portal-lists', portalListsRoutes);
app.use('/api/portal-notes', portalNotesRoutes);
app.use('/api/portal-qc', portalQcRoutes);
app.use('/api/client', clientRoutes);

// Bourne writes have their own key (isBourneWrite), audit log and limiter; mount before the read router.
app.use('/api/bourne/write', bourneWriteRoutes);
// Bourne uses its own key (isBourne), not isAuth, and must precede the catch-all.
app.use('/api/bourne', bourneRoutes);

// The shop Mac agent authenticates with its own device token (isPrintAgent), not isAuth.
app.use('/api/print-agent', createPrintAgentRouter({ db: require('./db/db') }));

// Catch-all handler for React
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Example routes
app.get('/', (req, res) => {
    res.send('Welcome to the LEEMAC API');
});

app.use((req, res) => {
    console.error(`404 Error: ${req.method} ${req.url}`); // Log 404 errors
    res.status(404).send('Endpoint not found');
});

module.exports = app;
