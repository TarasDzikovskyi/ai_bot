const { OpenAI } = require('openai');
const fs = require('fs');
const { downloadFile, isLikelyOrder } = require('../utils/utils');
const {ports, cities} = require('../constants')
const {connectTo1C} = require('./data1C.service');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


/**
 * Generates a prompt for the OpenAI API based on the input text
 * @param {string} text - The input text
 * @returns {string} - The generated prompt
 */
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

            const errorMessage = `Не вдалося отримати всі дані з аудіо. 
${(!parsed.from.value || !parsed.from.confidence) ? 'Поле "порт відправлення" некоректне.' : ''}
${(!parsed.to.value || !parsed.to.confidence) ? 'Поле "місто призначення" некоректне.' : ''}
${(!parsed.weight.value || !parsed.weight.confidence) ? 'Поле "вага" некоректне.' : ''}
${(!parsed.volume.value || !parsed.volume.confidence) ? 'Поле "об`єм" некоректне.' : ''}

Змінити?`;

            await bot.sendMessage(chatId, errorMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Так', callback_data: 'edit_yes' }, { text: 'Ні', callback_data: 'edit_no' }]
                    ]
                }
            });
        } else {
            // Відправляємо результат користувачеві
            const data = formatShippingInfo(reply);
            await bot.sendMessage(chatId, data, { parse_mode: 'Markdown' });
            await data1CHandler(reply, chatId, bot);
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
${(!obj.from.value || !obj.from.confidence) ? 'Поле "порт відправлення" некоректне.' : ''}
${(!obj.to.value || !obj.to.confidence) ? 'Поле "місто призначення" некоректне.' : ''}
${(!obj.weight.value || !obj.weight.confidence) ? 'Поле "вага" некоректне.' : ''}
${(!obj.volume.value || !obj.volume.confidence) ? 'Поле "об`єм" некоректне.' : ''}
`);
    } else {
        const data = formatShippingInfo(reply);
        await bot.sendMessage(chatId, data, { parse_mode: 'Markdown' });
        await data1CHandler(reply, chatId, bot);
    }

}
// доставка до складу - cfs
// доставка до дверей - rd
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
Є початковий об'єкт замовлення з деякими некоректними даними (confidence: false) або (value: null):
"""${JSON.stringify(user.originalData)}"""

Користувач уточнив наступне:
"""${newText}"""

`;

    const prompt = getPrompt(combinedPrompt);

    const gptResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
    });

    const reply = gptResponse.choices[0].message.content;

    user.correctedData = reply;
    userState.set(chatId, user);

    // Parse the JSON data for better formatting
    let parsedData;
    try {
        parsedData = JSON.parse(reply);
    } catch (err) {
        console.error('❌ Не вдалося розпарсити JSON:', err);
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
        return;
    }

    // Create a nicely formatted message
    const formattedMessage = `📦 *Оновлені дані замовлення:*

🚢 *Відправлення:* ${parsedData.from.value || 'Не вказано'}
📍 *Призначення:* ${parsedData.to.value || 'Не вказано'}
⚖️ *Вага:* ${parsedData.weight.value || 'Не вказано'} кг
📐 *Об'єм:* ${parsedData.volume.value || 'Не вказано'} м³`;

    await bot.sendMessage(chatId, formattedMessage, {
        parse_mode: 'Markdown',
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


function formatShippingInfo(data) {
    console.log(data)
    const {
        from,
        to,
        weight,
        volume
    } = JSON.parse(data);

    return `📦 *Деталі вантажу:*

🚢 *Відправлення:* ${from.value}
📍 *Призначення:* ${to.value}
⚖️ *Вага:* ${weight.value} кг
📐 *Обʼєм:* ${volume.value} м³

⏳ Розраховую вартість...`;
}


function formatShippingResult(data) {
    console.log(data)
    const {
        from,
        to,
        weight,
        volume
    } = JSON.parse(data);

    return `📦 *Деталі вантажу:*

🚢 *Відправлення:* ${from.value}
📍 *Призначення:* ${to.value}
⚖️ *Вага:* ${weight.value} кг
📐 *Обʼєм:* ${volume.value} м³

⏳ Розраховую вартість...`;
}


async function data1CHandler(reply, chatId, bot){
    const resultPrice = await connectTo1C(JSON.parse(reply));
    console.log(resultPrice)

    if(resultPrice.status === 'NOT OK'){
        await bot.sendMessage(chatId, 'Проблема з прорахунком. Спробуйте пізніше!', );
    } else {

    }
}

module.exports = {
    getPrompt,
    handleAudio,
    handleText,
    handlePhoto,
    handleCorrection
};
