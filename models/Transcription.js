const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transcription = sequelize.define('Transcription', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    chatId: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    userId: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    audioFileId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    transcription: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: true,
    tableName: 'transcriptions'
});

module.exports = Transcription; 