# Telegram Audio to Text Bot

This is a Telegram bot that converts audio messages and audio files to text using OpenAI's Whisper model.

## Setup

1. Create a Telegram bot using [@BotFather](https://t.me/BotFather) and get your bot token
2. Get an OpenAI API key from [OpenAI](https://platform.openai.com/)
3. Clone this repository
4. Install dependencies:
   ```bash
   npm install
   ```
5. Create a `.env` file in the root directory and add your tokens:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```
6. Start the bot:
   ```bash
   node server.js
   ```

## Usage

1. Start a chat with your bot
2. Send an audio message or audio file
3. The bot will process the audio and respond with the transcribed text

## Features

- Converts voice messages to text
- Converts audio files to text
- Uses OpenAI's Whisper model for accurate transcription
- Real-time processing status updates

## Requirements

- Node.js
- npm
- Telegram Bot Token
- OpenAI API Key 
