const { Sequelize } = require('sequelize');
const constants = require('../constants');

console.log(constants.db_host)
console.log(constants.db_name)

const sequelize = new Sequelize(constants.db_name, constants.db_user, constants.db_password, {
    host: constants.db_host,
    port: constants.db_port,
    dialect: constants.db_dialect,
    logging: false,
    // define: {
    //     schema: 'square'
    // },
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false,
        },
    },
});


module.exports.sequelize = sequelize;

