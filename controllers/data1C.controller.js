

module.exports.approveUser = async (req, res, next) => {
    try {
        console.log(req.body)


    } catch (e) {
        next(e)
    }
}
