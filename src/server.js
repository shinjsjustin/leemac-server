// const fs = require('fs');
// const https = require('https')
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');

const companyRoutes = require('./routes/company');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const partRoutes = require('./routes/parts');
const quoteRoutes = require('./routes/quote');
// const sheetRoutes = require('./routes/sheet');

dotenv.config();
const cors = require('cors');
const app = express();

const isAuth = require('./middleware/isAuth');

app.use(cors());
app.use(bodyParser.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.use('/api/company', isAuth, companyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/part', partRoutes);
app.use('/api/quote', quoteRoutes);
// app.use('/sheet', sheetRoutes);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });

app.get('/', (req, res)=>{
    res.send('Welcome to the LEEMAC api');
});

app.get('/test', (req, res)=>{
    res.status(201).json({message: 'Ur bumd'})
})

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>{
    console.log(`Server is running on port ${PORT}`);
});