const fs = require('fs');
const https = require('https')
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

const companyRoutes = require('./routes/company');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const partRoutes = require('./routes/parts');
const quoteRoutes = require('./routes/quote');
const sheetRoutes = require('./routes/sheet');

dotenv.config();
const cors = require('cors');
const app = express();

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/leemac.shop/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/leemac.shop/fullchain.pem')
};

const isAuth = require('./middleware/isAuth');

app.use(cors());
app.use(bodyParser.json());

app.use('/company', isAuth, companyRoutes);
app.use('/admin', adminRoutes);
app.use('/client', clientRoutes);
app.use('/part', partRoutes);
app.use('/quote', quoteRoutes);
app.use('/sheet', sheetRoutes);


app.get('/', (req, res)=>{
    res.send('Welcome to the LEEMAC api');
});

// Create an HTTPS server with the options
https.createServer(options, app).listen(443, () => {
    console.log('HTTPS Server running on port 443');
});

// Optional: Redirect HTTP requests to HTTPS
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);

// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () =>{
//     console.log(`Server is running on port ${PORT}`);
// });