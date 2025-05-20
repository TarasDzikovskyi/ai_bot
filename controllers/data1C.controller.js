

module.exports.approveUser = async (req, res, next) => {
    try {
        console.log(req.body)


        res.status(200).json({message: 'ok'})
    } catch (e) {
        next(e)
    }
}
