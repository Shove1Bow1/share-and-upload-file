function checkAuthentication(req, res, next) {
    try {
        if (req.session.userId) {
            return next;
        }
    }
    catch(e){
        console.log(e);
        return false;
    }
}
module.exports = {
    checkAuthentication
}