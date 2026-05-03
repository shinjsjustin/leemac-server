const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
// TODO: Import additional route files here as you build out the app:
//   const itemRoutes = require('./routes/item');

const isAuth = require('./middleware/isAuth');

dotenv.config();

const app = express();

// Allow requests from the React dev server.
// In production the server serves the built React app directly, so CORS
// is only needed during development.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(bodyParser.json());

// Session is used by OAuth strategies (e.g. passport-google-oauth20).
// If you're not adding OAuth, you can remove this block.
app.use(session({
    // TODO: SESSION_SECRET must be set in .env
    secret: process.env.SESSION_SECRET || 'TODO_replace_with_strong_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

// ── Public routes (no auth required) ────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Protected routes (JWT required via isAuth middleware) ────────────────────
// All routes mounted after isAuth will require a valid Bearer token.
app.use('/api/user', isAuth, userRoutes);
// TODO: Add more protected route groups here:
//   app.use('/api/items', isAuth, itemRoutes);

// ── Serve the built React app in production ──────────────────────────────────
// During development `npm run dev` runs the React dev server separately.
app.use(express.static(path.join(__dirname, 'client/build')));

// Catch-all: send any unmatched GET to the React app so client-side routing works.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    console.error(`404: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
