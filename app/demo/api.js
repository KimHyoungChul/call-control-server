
memberList = require('./data');
_ = require('underscore');

module.exports = function(app) {

    app.get('/member', function(req, res, next) {
        res.send(JSON.stringify(memberList));
    });
    
    app.get('/login', function(req, res, next) {
        var password = req.query.password;
        var email = req.query.email;
        console.log(req.query);
        console.log(req.body);
        console.log(req.params);
        var success = false;
        _.each(memberList,function(m) {
            if (m.password==password && m.email == email) {
                success = true;
                res.send(JSON.stringify({result:true,userId:m.userId}));
            }
        })
        if (!success)
            res.send(JSON.stringify({result:false}));
    });
    

};

  


