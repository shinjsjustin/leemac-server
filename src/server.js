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


const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>{
    console.log(`Server is running on port ${PORT}`);
});