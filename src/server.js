const dotenv = require('dotenv');

dotenv.config();

if (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim()) {
    console.error('SESSION_SECRET environment variable is required');
    process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>{
    console.log(`Server is running on port ${PORT}`);
});