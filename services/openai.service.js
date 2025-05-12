const { OpenAI } = require('openai');
const fs = require('fs');
const { downloadFile, isLikelyOrder } = require('../utils/utils');
const {ports, cities} = require('../constants')

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generates a prompt for the OpenAI API based on the input text
 * @param {string} text - The input text
 * @returns {string} - The generated prompt
 */
// function getPrompt(text) {
//     const prompt = `
// Ти — досвідчений логістичний асистент. Твоя задача — уважно проаналізувати текст замовлення на перевезення вантажу та витягнути з нього ключову інформацію про маршрут і характеристики вантажу.
//
// 🔍 Найважливіше:
// - Обов'язково перевір, чи вказаний порт у полі "from" є реальним, міжнародно визнаним портом (наприклад, через бази даних портів).
// - Якщо такого порту **не існує**, або назва написана неправильно, або не вказаний саме порт (а не просто місто) — поверни **null**: 'null'. Це обовʼязкова умова.
// - Так само обов'язково перевір, чи вказане місце призначення в полі "to" (місто або країна) **дійсно існує**. Якщо воно не ідентифікується — також поверни **null** 'null'.
//
// 📦 На основі наданого тексту поверни **тільки** валідний JSON з наступною структурою:
//
// {
//   "from": {
//     "value": "Міжнародна назва порту завантаження (англійською, лише порт)",
//     "confidence": true | false
//   },
//   "to": {
//     "value": "Місце розвантаження або доставки (англійською)",
//     "confidence": true | false
//   },
//   "weight": {
//     "value": "Вага вантажу у кілограмах (тільки число або null)",
//     "confidence": true | false
//   },
//   "volume": {
//     "value": "Обʼєм вантажу у кубічних метрах (тільки число або null)",
//     "confidence": true | false
//   }
// }
//
// 📌 Додаткові умови:
// - Якщо інформація не згадується або нечітка — вкажи "value": null і "confidence": false.
// - Якщо одиниці інші (тонни, літри, фут³ тощо) — конвертуй у кг або м³.
// - Позначай "confidence": true тільки якщо впевнений на 100%.
// - **Ніколи** не додавай жодних пояснень — лише JSON або порожній об'єкт.
// - Якщо порт "from" або місце "to" не валідне або не існує — **відповідь має бути тільки** 'null'.
//
// Ось текст:
// """${text}"""
// `;
//
//     return prompt;
// }

function getPrompt(text) {
    const portList = ports.map(port => `"${port.value}"`).join(', ');
    const cityList = cities.map(city => `"${city.value}"`).join(', ');


    // - Обов'язково перевір, чи вказаний порт у полі "from" є реальним, міжнародно визнаним портом (наприклад, через бази даних портів).
    // - Якщо такого порту **не існує**, або назва написана неправильно, або не вказаний саме порт (а просто місто) — поверни **null**: 'null'. Це обовʼязкова умова.
    // - Так само обов'язково перевір, чи вказане місце призначення в полі "to" (місто ) **дійсно існує**. Якщо воно не ідентифікується — також поверни **null** 'null'.


    const prompt = `
Ти — досвідчений логістичний асистент. Твоя задача — проаналізувати текст замовлення на перевезення вантажу та витягнути з нього ключову інформацію про маршрут і характеристики вантажу.

🔍 Важливо:

- Маєш **перевірити**, чи порт завантаження (поле "from") **є в наступному списку дозволених портів**: [${portList}]
- Якщо "from" не входить у цей список — **відповідь має бути** лише: 'null'
- Те саме з місцем призначення (поле "to"): якщо його не має в наступному списку дозволених міст**: [${cityList}] — **відповідь у полі "value" має бути**: null, а у полі "confidence": false
📦 Поверни лише валідний JSON у цьому форматі:

{
    "from": {
        "value": "Назва порту АНГЛІЙСЬКОЮ ВИКЛЮЧНО ЗІ СПИСКУ дозволених портів АБО 'null'",
        "confidence": true | false
    },
    "to": {
        "value": "Назва міста АНГЛІЙСЬКОЮ ВИКЛЮЧНО ЗІ СПИСКУ дозволених міст АБО 'null'",
        "confidence": true | false
    },
    "weight": {
        "value": число у кг (без помилок) або null,
        "confidence": true | false
    },
    "volume": {
        "value": число у м³ або null,
        "confidence": true | false
    }
}

📌 Уточнення:
- Якщо значення нечітке — став value: null і confidence: false
- Якщо вказано в інших одиницях (тонни, літри тощо) — переведи у кг або м³
- Не додавай пояснень. Вивід має бути **лише JSON** або 'null'
- Не придумуй свої значення чи назви!!!
- Якщо міста або порту немає в списку дозволених, у полі "value" **ОБОВ'ЯЗКОВО** має бути null
❗ Не множ вагу без причини. Якщо написано "20 кілограмів", то це 20, а не 20000.
- Якщо одиниці інші (тонни, літри) — переведи точно


Ось текст:
"""${text}"""
`;

    return prompt;
}


/**
 * Handles audio messages by transcribing them and extracting information
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The message object
 * @param {number} chatId - The chat ID
 * @param {Object} userState - The user state map
 * @returns {Promise<void>}
 */
async function handleAudio(bot, msg, chatId, userState) {
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

        console.log(gptResponse);

        const reply = gptResponse.choices[0].message.content;
        console.log(reply);

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
                        [{ text: 'Так', callback_data: 'edit_yes' }, { text: 'Ні', callback_data: 'edit_no' }]
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

/**
 * Handles text messages by extracting information
 * @param {Object} bot - The Telegram bot instance
 * @param {string} text - The text message
 * @param {number} chatId - The chat ID
 * @returns {Promise<void>}
 */
async function handleText(bot, text, chatId) {
    const prompt = getPrompt(text);

    const gptResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
    });

    const reply = gptResponse.choices[0].message.content;

    if(reply.includes('null') || reply.includes('false')){
        await bot.sendMessage(chatId, reply);
        const obj = JSON.parse(reply);
        await bot.sendMessage(chatId, `Прорахунок неможливий.
${(!obj.from.value || !obj.from.confidence || !obj.to.value || !obj.to.confidence) ? 'Перевірте список доступних міст і портів.' : ''}
${(!obj.weight.value || !obj.weight.confidence || !obj.volume.value || !obj.volume.confidence) ? 'Дані ваги чи об`єму некоректні.' : ''}
`);
    } else {
        await bot.sendMessage(chatId, reply);
        await bot.sendMessage(chatId, 'Дані відправлені в 1С');

    }

}

/**
 * Handles photo messages by analyzing them
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The message object
 * @param {number} chatId - The chat ID
 * @returns {Promise<void>}
 */
async function handlePhoto(bot, msg, chatId) {
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

/**
 * Handles correction messages
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The message object
 * @param {number} chatId - The chat ID
 * @param {Object} user - The user object
 * @param {Object} userState - The user state map
 * @returns {Promise<void>}
 */
async function handleCorrection(bot, msg, chatId, user, userState) {
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

    console.log(user);

    const combinedPrompt = `
Є початковий об'єкт замовлення з деякими некоректними даними (confidence: false):
"""${user.originalData}"""

Користувач уточнив наступне:
"""${newText}"""

На основі обох частин онови обʼєкт даних та поверни оновлений об'єкт (дивись правила формування).
`;

    console.log(combinedPrompt);

    const gptResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: combinedPrompt }]
    });

    const reply = gptResponse.choices[0].message.content;

    user.correctedData = reply;
    userState.set(chatId, user);

    await bot.sendMessage(chatId, `Оновлені дані:\n${reply}`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Все вірно', callback_data: 'confirm_correct' },
                    { text: '❌ Скасувати', callback_data: 'cancel_all' }
                ]
            ]
        }
    });
}

module.exports = {
    getPrompt,
    handleAudio,
    handleText,
    handlePhoto,
    handleCorrection
};