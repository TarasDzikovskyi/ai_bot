const {DataTypes} = require('sequelize');
const {sequelize} = require('./index');

const User = sequelize.define('user', {
    //id: {type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true},
    name: { type: DataTypes.STRING, allowNull: false },
    surname: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    phone_number: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING(512), allowNull: false },
    is_approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    enable_2fa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
    timestamps: true,
    indexes: [
        { unique: true, fields: ['email'] }
    ]
});

const OAuth = sequelize.define('oauth', {
    access_token: {type: DataTypes.STRING(1024), required: true, allowNull: false},
    refresh_token: {type: DataTypes.STRING(1024), required: true, allowNull: false},
    user: {type: DataTypes.INTEGER, required: true, references: {model: User, key: 'id'}}
}, {timestamps: true});


const GAuth = sequelize.define('gauth', {
    token: {type: DataTypes.STRING(1024), required: true, allowNull: false},
    data: {type: DataTypes.JSON, required: true, allowNull: false},
    user: {type: DataTypes.INTEGER, required: true, references: {model: User, key: 'id'}}
}, {timestamps: true});


const OAuthAction = sequelize.define('oauth_action', {
    action_token: {type: DataTypes.STRING(1024), required: true, allowNull: false},
    user: {type: DataTypes.INTEGER, required: true, references: {model: User, key: 'id'}}
}, {timestamps: true});


User.hasOne(OAuth, { foreignKey: 'user', as: 'oauth' });
OAuth.belongsTo(User, { foreignKey: 'user', as: 'userData' });

User.hasOne(GAuth, { foreignKey: 'user', as: 'gauth' });
GAuth.belongsTo(User, { foreignKey: 'user', as: 'userData' });


module.exports.User = User;
module.exports.OAuth = OAuth;
module.exports.OAuthAction = OAuthAction;
module.exports.GAuth = GAuth;
