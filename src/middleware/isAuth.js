const jwt = require('jsonwebtoken')

const isAuth = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
    // console.log('isAuth token: ', token)
    if(token == null){
        return res.status(401).json({message: 'Token is NULL'});
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) =>{
        if(err){
            return res.status(403).json({message: 'Token is INVALID'});
        }
        req.user = user;
        next();
    });
};



module.exports = isAuth