require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    console.log(msg);
    
    try {
        if (msg.voice || msg.audio) {
            await handleAudio(msg, chatId);
        } else if (msg.text) {
            await handleText(msg.text, chatId);
        // } else if (msg.photo) {
        //     await handlePhoto(msg, chatId);
        } else {
            bot.sendMessage(chatId, 'Будь ласка, надішли текст, аудіо або зображення.');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        bot.sendMessage(chatId, 'Сталася помилка при обробці повідомлення.');
    }
});

// 🎙️ Обробка аудіо або voice
async function handleAudio(msg, chatId) {
    const fileId = msg.voice?.file_id || msg.audio?.file_id;

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const processingMsg = await bot.sendMessage(chatId, '🎧 Обробляю аудіо...');

    try {
        const localFilePath = await downloadFile(fileUrl, `audio_${Date.now()}.oga`);

        // Використовуємо Whisper для транскрипції
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(localFilePath),
            model: "whisper-1",
            language: "uk"
        });

        if (!transcription.text) {
            throw new Error('Не вдалося отримати текст з аудіо');
        }

        console.log(transcription);
        
        const text = transcription.text;

        // Використовуємо GPT для витягування інформації з тексту
 
        const prompt = getPrompt(text);


        const gptResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }]
        });

        // console.log(gptResponse);
        

        const reply = gptResponse.choices[0].message.content;

        console.log(reply)

        if(!reply.from.confidence || !reply.to.confidence || !reply.weight.confidence || !reply.volume.confidence) {
            await bot.sendMessage(chatId, 'Не вдалося отримати всі дані з аудіо.');

        }

        // Відправляємо результат користувачеві
        await bot.editMessageText(reply, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
    } catch (error) {
        console.error('❌ Error in audio processing:', error);
        await bot.editMessageText('Помилка при обробці аудіо. Спробуйте ще раз.', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
    }
}

// 💬 Обробка тексту
async function handleText(text, chatId) {
    const prompt = getPrompt(text);

    const gptResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
    });

    const reply = gptResponse.choices[0].message.content;
    await bot.sendMessage(chatId, reply);
}

// 🖼️ Обробка зображення
async function handlePhoto(msg, chatId) {
    const fileId = msg.photo[msg.photo.length - 1].file_id; // Найбільше зображення
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const processingMsg = await bot.sendMessage(chatId, '🧠 Аналізую зображення...');

    const visionResponse = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", content: "Проаналізуй це зображення або витягни дані з нього." },
                    { type: "image_url", image_url: { url: fileUrl } }
                ]
            }
        ]
    });

    const reply = visionResponse.choices[0].message.content;
    await bot.editMessageText(reply, {
        chat_id: chatId,
        message_id: processingMsg.message_id
    });
}

console.log('🤖 Bot is running...');


function getPrompt(text) {

    const prompt = `
Ти — досвідчений логістичний асистент. Твоя задача — уважно проаналізувати текст замовлення на перевезення вантажу та витягнути з нього ключову інформацію про маршрут і характеристики вантажу.

🔍 Найважливіше:
- Обов’язково перевір, чи вказаний порт у полі "from" є реальним, міжнародно визнаним портом (наприклад, через бази даних портів).
- Якщо такого порту **не існує**, або назва написана неправильно, або не вказаний саме порт (а не просто місто) — поверни **null**: 'null'. Це обовʼязкова умова.
- Так само обов’язково перевір, чи вказане місце призначення в полі "to" (місто або країна) **дійсно існує**. Якщо воно не ідентифікується — також поверни **null** 'null'.

📦 На основі наданого тексту поверни **тільки** валідний JSON з наступною структурою:

{
  "from": {
    "value": "Міжнародна назва порту завантаження (англійською, лише порт)",
    "confidence": true | false
  },
  "to": {
    "value": "Місце розвантаження або доставки (англійською)",
    "confidence": true | false
  },
  "weight": {
    "value": "Вага вантажу у кілограмах (тільки число або null)",
    "confidence": true | false
  },
  "volume": {
    "value": "Обʼєм вантажу у кубічних метрах (тільки число або null)",
    "confidence": true | false
  }
}

📌 Додаткові умови:
- Якщо інформація не згадується або нечітка — вкажи "value": null і "confidence": false.
- Якщо одиниці інші (тонни, літри, фут³ тощо) — конвертуй у кг або м³.
- Позначай "confidence": true тільки якщо впевнений на 100%.
- **Ніколи** не додавай жодних пояснень — лише JSON або порожній об'єкт.
- Якщо порт "from" або місце "to" не валідне або не існує — **відповідь має бути тільки** 'null'.

Ось текст:
"""${text}"""
`;


    return prompt;
}

async function downloadFile(url, filename) {

    const directoryPath = path.join(__dirname, 'audio');

    await fs.promises.mkdir(directoryPath, { recursive: true });

    const filePath = path.join(directoryPath, filename);

    const writer = fs.createWriteStream(filePath);

    const response = await axios.get(url, { responseType: 'stream' });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}


function createResponseText() {
    const text = `Ваші дані:
    Порт завантаження: 
    Місце доставки:
    Вага вантажу:
    Обʼєм вантажу:
    
    На основі ваших даних було прораховано наступне: 
    Ціна до місця доставки:
    Ціна до дверей: `

    return text
}