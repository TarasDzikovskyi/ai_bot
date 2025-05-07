require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { AssemblyAI } = require('assemblyai');
const sequelize = require('./config/database');
const Transcription = require('./models/Transcription');

const app = express();
const port = process.env.PORT || 3000;

// Initialize the Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize AssemblyAI client
const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLY_API_KEY
});

// Test database connection
sequelize.authenticate()
    .then(() => {
        console.log('Database connection has been established successfully.');
        // Sync all models
        return sequelize.sync();
    })
    .then(() => {
        console.log('All models were synchronized successfully.');
    })
    .catch(err => {
        console.error('Unable to connect to the database:', err);
    });

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Welcome! Send me an audio file and I will convert it to text for you.');
});

// Handle audio messages
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        // Send a processing message
        const processingMsg = await bot.sendMessage(chatId, 'Processing your audio...');
        
        // Get the file ID and download the audio file
        const fileId = msg.voice.file_id;
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
        
        // Convert audio to text using AssemblyAI
        const transcript = await client.transcripts.transcribe({
            audio: fileUrl
        });

        if (transcript.status === 'error') {
            throw new Error(`Transcription failed: ${transcript.error}`);
        }
        
        // Save transcription to database
        await Transcription.create({
            chatId,
            userId,
            audioFileId: fileId,
            transcription: transcript.text
        });
        
        // Send the transcribed text
        await bot.editMessageText(transcript.text, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
    } catch (error) {
        console.error('Error:', error);
        bot.sendMessage(chatId, 'Sorry, there was an error processing your audio. Please try again.');
    }
});

// Handle regular audio files
bot.on('audio', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        // Send a processing message
        const processingMsg = await bot.sendMessage(chatId, 'Processing your audio...');
        
        // Get the file ID and download the audio file
        const fileId = msg.audio.file_id;
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
        
        // Convert audio to text using AssemblyAI
        const transcript = await client.transcripts.transcribe({
            audio: fileUrl
        });

        if (transcript.status === 'error') {
            throw new Error(`Transcription failed: ${transcript.error}`);
        }
        
        // Save transcription to database
        await Transcription.create({
            chatId,
            userId,
            audioFileId: fileId,
            transcription: transcript.text
        });
        
        // Send the transcribed text
        await bot.editMessageText(transcript.text, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
    } catch (error) {
        console.error('Error:', error);
        bot.sendMessage(chatId, 'Sorry, there was an error processing your audio. Please try again.');
    }
});

// Basic Express server setup
app.get('/', (req, res) => {
    res.send('Telegram Bot Server is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 