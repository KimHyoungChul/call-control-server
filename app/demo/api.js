
memberList = require('./data');


module.exports = function(app) {

    app.get('/member', function(req, res, next) {
        res.send(JSON.stringify(memberList));
    });
    

};

  


