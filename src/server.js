// const fs = require('fs');
// const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const passport = require('passport');

const internalRoutes = require('./routes/internal');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const oAuthRoutes = require('./routes/oAuth');
const jarvisRoutes = require('./routes/jarvis');

dotenv.config();
const cors = require('cors');
const app = express();

const isAuth = require('./middleware/isAuth');

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(bodyParser.json());

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true for HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.use('/api/internal', isAuth, internalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/auth', oAuthRoutes);
app.use('/api/jarvis', isAuth, jarvisRoutes);

// Catch-all handler for React
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Example routes
app.get('/', (req, res) => {
    res.send('Welcome to the LEEMAC API');
});

app.get('/test', (req, res) => {
    res.status(201).json({ message: 'Ur bumd' });
});

app.use((req, res) => {
    console.error(`404 Error: ${req.method} ${req.url}`); // Log 404 errors
    res.status(404).send('Endpoint not found');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>{
    console.log(`Server is running on port ${PORT}`);
});