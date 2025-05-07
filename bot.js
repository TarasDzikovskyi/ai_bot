require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {OpenAI} = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ports = [
    { text: 'Шанхай', value: 'Shanghai' },
    { text: 'Нінбо', value: 'Ningbo' },
    { text: 'Сінгапур', value: 'Singapore' },
    { text: 'Гонконг', value: 'HongKong' },
    { text: 'Пусан', value: 'Busan' },
    { text: 'Тіанцзінь', value: 'Tianjin' },
    { text: 'Гамбург', value: 'Hamburg' },
    { text: 'Роттердам', value: 'Rotterdam' },
    { text: 'Антверпен', value: 'Antwerp' },
    { text: 'Дубай', value: 'Dubai' },
    { text: 'Одеса', value: 'Odessa' },
];

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

const userState = new Map();
const dialogStates = new Map();
const sessionMap = new Map();

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привіт! Обери дію:', {
        reply_markup: {
            keyboard: [
                ['🔊 Надіслати аудіо', '📝 Надіслати текст'],
                ['📦 Прорахувати вантаж', 'ℹ️ Допомога']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
});


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const state = dialogStates.get(chatId);
    const sessionState = sessionMap.get(chatId);
    const user = userState.get(chatId);


    if (user?.isEditing) {
        if (msg.text || msg.voice || msg.audio) {
            await handleCorrection(msg, chatId, user);
            userState.delete(chatId);
            return;
        } else {
            await bot.sendMessage(chatId, 'Надішли текст або аудіо з уточненням.');
            return;
        }
    }

    console.log(msg);

    try {
        if (sessionState === 'awaiting_gpt_input') {
            sessionMap.delete(chatId);

            if (isLikelyOrder(msg.text)) {
                await handleText(msg.text, chatId);
            } else {
                // await bot.sendMessage(chatId, 'Це повідомлення не схоже на запит щодо перевезення вантажу. Будь ласка, вкажіть деталі доставки.');
            }
        }

        if (sessionState === 'awaiting_gpt_audio') {
            sessionMap.delete(chatId);
            if (msg.voice || msg.audio) {
                await handleAudio(msg, chatId);
            }
            // else await bot.sendMessage(chatId, 'Це не аудіо!')
        }

        if (msg.text === '🔊 Надіслати аудіо') {
            sessionMap.set(chatId, 'awaiting_gpt_audio');
            await bot.sendMessage(chatId, 'Надішли голосове повідомлення з інформацією про замовлення.');
            return;
        }

        if (msg.text === '📝 Надіслати текст') {
            sessionMap.set(chatId, 'awaiting_gpt_input');
            await bot.sendMessage(chatId, 'Будь ласка, введіть текст замовлення на прорахунок вантажу.');
            return;
        }

        if (msg.text === '📦 Прорахувати вантаж') {
            dialogStates.set(chatId, {step: 'awaitingPort'});

            const inlineKeyboard = chunkArray(
                ports.map(p => ({ text: p.text, callback_data: `port:${p.value}` })),
                2
            );

            return bot.sendMessage(chatId, 'Оберіть порт завантаження:', {
                reply_markup: {
                    inline_keyboard: inlineKeyboard,
                },
            });
        }

        if (state) {
            if (state?.step === 'awaitingCity') {
                state.city = msg.text;
                state.step = 'awaitingVolume';
                return bot.sendMessage(chatId, 'Введіть обʼєм (м³):');
            }

            // Сценарій на введення об'єму
            if (state?.step === 'awaitingVolume') {
                if (isNaN(parseFloat(msg.text))) return bot.sendMessage(chatId, 'Введіть коректне число (м³):');
                state.volume = parseFloat(msg.text);
                state.step = 'awaitingWeight';
                return bot.sendMessage(chatId, 'Введіть вагу (кг):');
            }

            if (state?.step === 'awaitingVolume') {
                if (isNaN(parseFloat(msg.text))) return bot.sendMessage(chatId, 'Введіть коректне число (м³):');
                state.volume = parseFloat(msg.text);
                state.step = 'awaitingWeight';
                return bot.sendMessage(chatId, 'Введіть вагу (кг):');
            }

            // Сценарій на введення ваги
            if (state?.step === 'awaitingWeight') {
                if (isNaN(parseFloat(msg.text))) return bot.sendMessage(chatId, 'Введіть коректну вагу (кг):');
                state.weight = parseFloat(msg.text);
                state.step = 'awaitingConfirmation';

                const summary = `🔍 Ви ввели:\n` +
                    `Порт: ${state.port}\n` +
                    `Місто доставки: ${state.city}\n` +
                    `Обʼєм: ${state.volume} м³\n` +
                    `Вага: ${state.weight} кг\n\n` +
                    `Підтвердити замовлення?`;

                return bot.sendMessage(chatId, summary, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {text: '✅ Підтвердити', callback_data: 'confirm'},
                                {text: '❌ Скасувати', callback_data: 'cancel'}
                            ],
                        ],
                    },
                });
            }
        }

        if (msg.text === 'ℹ️ Допомога') {
            await bot.sendMessage(chatId, 'Надішли текст або голосове повідомлення, а бот обробить вашу інформацію і прорахує суму доставки. Якщо аудіо дані не точні — ти зможеш їх уточнити.');
            return;
        }

        // if (msg.voice || msg.audio) {
        //     await handleAudio(msg, chatId);
        // }
        // else if (msg.text) {
        //     // await handleText(msg.text, chatId);
        //     // } else if (msg.photo) {
        //     //     await handlePhoto(msg, chatId);
        // } else {
        //     bot.sendMessage(chatId, 'Будь ласка, надішли текст або аудіо для прорахунку ціни.');
        // }
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
            messages: [{role: 'user', content: prompt}]
        });

        console.log(gptResponse);


        const reply = gptResponse.choices[0].message.content;
        console.log(reply)

        let parsed;
        try {
            parsed = JSON.parse(reply);
        } catch (err) {
            console.error('❌ Не вдалося розпарсити JSON:', err);
            await bot.editMessageText('Виникла помилка при обробці відповіді GPT.', {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
            return;
        }

        if (!parsed.from.confidence || !parsed.to.confidence || !parsed.weight.confidence || !parsed.volume.confidence) {
            userState.set(chatId, {
                originalText: text,
                originalData: parsed,
                isEditing: true,
                sourceType: 'audio'
            });

            await bot.sendMessage(chatId, 'Не вдалося отримати всі дані з аудіо. Змінити?', {
                reply_markup: {
                    inline_keyboard: [
                        [{text: 'Так', callback_data: 'edit_yes'}, {text: 'Ні', callback_data: 'edit_no'}]
                    ]
                }
            });
        } else {
            // Відправляємо результат користувачеві
            await bot.editMessageText(reply, {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
        }
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
        messages: [{role: 'user', content: prompt}]
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
                    {type: "text", content: "Проаналізуй це зображення або витягни дані з нього."},
                    {type: "image_url", image_url: {url: fileUrl}}
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


bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const user = userState.get(chatId);
    const state = dialogStates.get(chatId);

    if (query.data.startsWith('port:')) {
        const port = query.data.split(':')[1];
        if (state) {
            state.port = port;
            state.step = 'awaitingCity';
            return bot.sendMessage(chatId, 'Введіть місто доставки:');
        }
    }

    if (query.data === 'edit_yes') {
        await bot.sendMessage(chatId, 'Будь ласка, надішли нове аудіо або текст із уточненнями.');
    }

    if (query.data === 'edit_no') {
        userState.delete(chatId);
        await bot.sendMessage(chatId, 'Добре, обробку скасовано.');
    }

    if (query.data === 'confirm_correct') {
        // Тут можна надіслати дані в 1С — поки заглушка
        console.log('➡️ Надсилаємо в 1С:', user?.correctedData || user?.originalData);

        await bot.sendMessage(chatId, '✅ Дані надіслано до 1С! Дякую.');
        userState.delete(chatId); // Очистити стан
    }

    if (query.data === 'cancel_all') {
        await bot.sendMessage(chatId, '❌ Уточнення скасовано. Якщо потрібно, надішли нові дані.');
        userState.delete(chatId);
    }


    if (query.data === 'confirm') {
        if (state?.step === 'awaitingConfirmation') {
            // Тут буде запит до 1С або інша логіка
            await bot.sendMessage(chatId, '🚀 Дані відправлено на прорахунок до 1С.\nОчікуйте відповідь менеджера.');
            dialogStates.delete(chatId); // Очистити стан
        }
    }

    // Скасування
    if (query.data === 'cancel') {
        dialogStates.delete(chatId);
        await bot.sendMessage(chatId, '❌ Прорахунок скасовано.');
    }


    await bot.answerCallbackQuery(query.id);
});

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

    await fs.promises.mkdir(directoryPath, {recursive: true});

    const filePath = path.join(directoryPath, filename);

    const writer = fs.createWriteStream(filePath);

    const response = await axios.get(url, {responseType: 'stream'});
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}


function createResponseText() {
    const text = `🔍 Ваші дані:
    Порт завантаження: 
    Місце доставки:
    Вага вантажу:
    Обʼєм вантажу:
    
    На основі ваших даних було прораховано наступне: 
    Ціна до місця доставки:
    Ціна до дверей: `

    return text
}


async function handleCorrection(msg, chatId, user) {
    let newText = '';

    if (msg.text) {
        newText = msg.text;
    } else if (msg.voice || msg.audio) {
        const fileId = msg.voice?.file_id || msg.audio?.file_id;
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const localFilePath = await downloadFile(fileUrl, `correction_${Date.now()}.oga`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(localFilePath),
            model: "whisper-1",
            language: "uk"
        });

        newText = transcription.text;
    }

    console.log(user)

    const combinedPrompt = `
Є початковий об'єкт замовлення з деякими некоректними даними (confidence: false):
"""${user.originalData}"""

Користувач уточнив наступне:
"""${newText}"""

На основі обох частин онови обʼєкт даних та поверни оновлений об'єкт (дивись правила формування).
`;

    console.log(combinedPrompt)

    const gptResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{role: 'user', content: combinedPrompt}]
    });

    const reply = gptResponse.choices[0].message.content;

    user.correctedData = reply;
    userState.set(chatId, user);

    await bot.sendMessage(chatId, `Оновлені дані:\n${reply}`, {
        reply_markup: {
            inline_keyboard: [
                [
                    {text: '✅ Все вірно', callback_data: 'confirm_correct'},
                    {text: '❌ Скасувати', callback_data: 'cancel_all'}
                ]
            ]
        }
    });
}


function isLikelyOrder(text) {
    const keywords = [
        'доставка', 'порт', 'море', 'контейнер',
        'відправка', 'обʼєм', 'вага', 'м³', 'кг', 'місто',
        'to', 'from', 'shipment', 'cargo', 'volume', 'weight', 'city'
    ];

    const lowerText = text.toLowerCase();

    return keywords.some(word => lowerText.includes(word));
}



function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}