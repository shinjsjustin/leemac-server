// const fs = require('fs');
// const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');

const internalRoutes = require('./routes/internal');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const quoteRoutes = require('./routes/quote');


dotenv.config();
const cors = require('cors');
const app = express();

const isAuth = require('./middleware/isAuth');

app.use(cors());
app.use(bodyParser.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.use('/api/internal', isAuth, internalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/quote', quoteRoutes);

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>{
    console.log(`Server is running on port ${PORT}`);
});