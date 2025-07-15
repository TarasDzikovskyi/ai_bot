const {OpenAI} = require('openai');
const fs = require('fs');
const {downloadFile, normalizeTextWithFuzzyMatch, normalizeFromTo, getValidityPeriod, convertToWav, saveBinaryFile} = require('../utils/utils');
const {ports, cities, supportedLanguages} = require('../constants')
const {connectTo1C} = require('./data1C.service');
const {post} = require("axios");
const {v4: uuidv4} = require('uuid');
const {GoogleGenAI} = require("@google/genai");
const mime = require("mime-types");
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');

// Initialize OpenAI client
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
// const text_model = 'gpt-3.5-turbo';
// const text_model = 'gpt-4-turbo';
const text_model = 'gpt-4o';
const audio_model = 'whisper-1';

function getPrompt(text) {
    logger.info('=================================TEXT PROMPT==================================');
    logger.info(text);
    logger.info('=================================TEXT PROMPT==================================');

    const portList = ports.map(port => `"${port.value}"`).join(', ');
    const cityList = cities.map(city => `"${city.value}"`).join(', ');

    return `
You are a skilled logistics assistant. Your task is to analyze a cargo transportation order text (e.g., transcribed from a voice message) and extract key route and cargo information.

Follow the rules precisely:

🔹 **"from"** — departure port  
🔹 **"to"** — destination city  
🔹 **"weight"** — weight in **kg**  
🔹 **"volume"** — volume in **m³**

---

**Validation rules:**

1. All ports ("from") must be **only from this list**:  
[${portList}]
2. All cities ("to") must be **only from this list**:  
[${cityList}]
3. If the port or city is not in the corresponding list — **return "value": null, "confidence": false**
4. If the name is similar but misspelled (e.g., "Dzindao" instead of "Qingdao") — try to find the closest match from the list and return it with '"confidence": true'. If unsure — return '"value": null', '"confidence": false'.

---

**Return the result in the following JSON format:**  

\`\`\`json
{
  "from": {
    "value": "Port name IN ENGLISH from the list or null",
    "confidence": true | false
  },
  "to": {
    "value": "City name IN ENGLISH from the list or null",
    "confidence": true | false
  },
  "weight": {
    "value": number in kg or null,
    "confidence": true | false
  },
  "volume": {
    "value": number in m³ or null,
    "confidence": true | false
  },
  "language": {
    "value": detected language of the order text in format (pl-PL, uk-UA, en-US, etc.),
    "confidence": true | false
  }
}
\`\`\`

---

⚠️ **Additional notes:**

- If "tons" are mentioned — convert to **kg** (1 ton = 1000 kg) — BE PRECISE  
- If "liters" are mentioned — ignore them (return volume: null)  
- If "m³", "cubic", "cubic meter" are mentioned — treat as volume  
- If you are not confident in a value — return 'null' and 'confidence: false'  
- Do **not** add explanations, comments, or extra text — **return valid JSON only**

---

Here is the order text:  
"""${text}"""
`;
}


function getPromptResponse(text, language, isOnlyStorage, storage) {
    if(!supportedLanguages.includes(language)) language = 'en-US';

    if(isOnlyStorage) {
        text = text + ' Please note, we can only deliver to the warehouse in Ukraine ' + storage
    }

    const prompt = `
Here is the data:
"""${text}"""

Follow these exact instructions:

You are an experienced female logistics assistant!
Give me a concise, emotionally engaging response based on this data, with a very very positive and enthusiastic tone — one that would make the client want to place an order!
Use the provided data in your reply.

Important notes:
- TotalRateCFS — delivery via warehouse, in US dollars ($)
- TotalRatePD — direct delivery (PD), in US dollars ($)
- Volume — measured in cubic meters (m³)
- Weight — measured in kilograms (kg)

!The reply MUST be in this language: ${language}! This is very important.
Max 2-4 sentences.
`

    return prompt;
}

// Highlight the final cost with a single "*" (not "**").


async function handleAudio(bot, msg, chatId, userState, sessionMap, data1CMap) {
    const sessionState = sessionMap.get(chatId);
    sessionMap.delete(chatId);

    const fileId = msg.voice?.file_id || msg.audio?.file_id;

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const processingMsg = await bot.sendMessage(chatId, '🎧 Обробляю аудіо...');

    try {
        const localFilePath = await downloadFile(fileUrl, `audio_${Date.now()}.oga`);

        // Використовуємо Whisper для транскрипції
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(localFilePath),
            model: audio_model,
            // language: "uk"
        });

        if (!transcription.text) {
            throw new Error('Не вдалося отримати текст з аудіо');
        }

        const text = transcription.text;
        logger.info(text)

        // Форматування тексту
        const cleanedText = normalizeTextWithFuzzyMatch(text);

        // if (!isLikelyOrder(cleanedText)) {
        //     return bot.sendMessage(chatId, 'Це повідомлення не схоже на запит щодо перевезення вантажу. Будь ласка, вкажіть деталі доставки.');
        // }

        // Використовуємо GPT для витягування інформації з тексту
        const prompt = getPrompt(cleanedText);

        const gptResponse = await openai.chat.completions.create({
            model: text_model,
            messages: [{role: 'user', content: prompt}]
        });

        const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

        const cleanedParsed = normalizeFromTo(JSON.parse(replyGPT));
        const reply = JSON.stringify(cleanedParsed);


        let parsed;
        try {
            parsed = JSON.parse(reply);
        } catch (err) {
            logger.error('❌ Не вдалося розпарсити JSON:', err);
            await bot.editMessageText('Виникла помилка при обробці відповіді GPT.', {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
            return;
        }

        logger.info('===========================PARSED AUDIO===========================')
        logger.info(parsed)
        logger.info('===========================PARSED AUDIO===========================')

        if (!parsed.from.confidence || !parsed.to.confidence || !parsed.weight.confidence || !parsed.volume.confidence
            || !parsed.from.value || !parsed.to.value || !parsed.weight.value || !parsed.volume.value) {

            userState.set(chatId, {
                originalText: cleanedText,
                originalData: parsed,
                isEditing: true,
                sourceType: 'audio',
                datetime: Date.now()
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
                        [{text: 'Так', callback_data: 'edit_yes'}, {text: 'Ні', callback_data: 'edit_no'}]
                    ]
                }
            });
        } else {
            // Відправляємо результат користувачеві
            const data = formatShippingInfo(reply);
            const message = await bot.sendMessage(chatId, data, {parse_mode: 'Markdown'});

            await data1CHandler(reply, chatId, bot, message, sessionState, sessionMap, data1CMap);
        }
    } catch (error) {
        logger.error('❌ Error in audio processing:', error);
        await bot.editMessageText('Помилка при обробці аудіо. Спробуйте ще раз.', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
    }
}


async function handleText(bot, text, chatId, sessionMap, data1CMap) {
    const sessionState = sessionMap.get(chatId);
    sessionMap.delete(chatId);

    const cleanedText = normalizeTextWithFuzzyMatch(text);

    const prompt = getPrompt(cleanedText);

    const gptResponse = await openai.chat.completions.create({
        model: text_model,
        messages: [{role: 'user', content: prompt}]
    });

    const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

    const cleanedParsed = normalizeFromTo(JSON.parse(replyGPT));

    logger.info('===========================PARSED TEXT===========================')
    logger.info(cleanedParsed)
    logger.info('===========================PARSED TEXT===========================')
    if(!cleanedParsed.language.confidence) cleanedParsed.language.confidence = true;

    const reply = JSON.stringify(cleanedParsed);
    // console.log(reply)

    if (reply.includes('null') || reply.includes('false')) {
        const obj = JSON.parse(reply);
        await bot.sendMessage(chatId, `Прорахунок неможливий.
${(!obj.from.value || !obj.from.confidence) ? 'Поле "порт відправлення" некоректне.' : ''}
${(!obj.to.value || !obj.to.confidence) ? 'Поле "місто призначення" некоректне.' : ''}
${(!obj.weight.value || !obj.weight.confidence) ? 'Поле "вага" некоректне.' : ''}
${(!obj.volume.value || !obj.volume.confidence) ? 'Поле "об`єм" некоректне.' : ''}
`);
    } else {
        const data = formatShippingInfo(reply);
        const processingMsg = await bot.sendMessage(chatId, data, {parse_mode: 'Markdown'});
        await data1CHandler(reply, chatId, bot, processingMsg, sessionState, sessionMap, data1CMap);
    }

}


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


async function handleCorrection(bot, msg, chatId, user, userState, sessionMap) {
    let newText = '';
    const sessionState = sessionMap.get(chatId);
    if(sessionState !== 'correction') return

    sessionMap.delete(chatId);
    userState.delete(chatId);

    if (msg.text) {
        newText = msg.text;
    } else if (msg.voice || msg.audio) {
        const fileId = msg.voice?.file_id || msg.audio?.file_id;
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const localFilePath = await downloadFile(fileUrl, `correction_${Date.now()}.oga`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(localFilePath),
            model: audio_model,
            language: "uk"
        });

        logger.info(transcription.text)
        newText = transcription.text;
    }

    const cleanedText = normalizeTextWithFuzzyMatch(newText);
    logger.info(user);
    logger.info(cleanedText);

    const combinedPrompt = `
There is an initial order object with some incorrect data (confidence: false) or (value: null):
"""${JSON.stringify(user.originalData)}"""

The remaining fields (confidence: true) should **remain as they were**

The user specified the following:
"""${cleanedText}"""
`;

    const prompt = getPrompt(combinedPrompt);

    const gptResponse = await openai.chat.completions.create({
        model: text_model,
        messages: [{role: 'user', content: prompt}]
    });

    const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

    const cleanedParsed = normalizeFromTo(JSON.parse(replyGPT));
    const reply = JSON.stringify(cleanedParsed);

    user.correctedData = reply;
    userState.set(chatId, user);

    // Parse the JSON data for better formatting
    let parsedData;
    try {
        parsedData = JSON.parse(reply);
    } catch (err) {
        logger.error('❌ Не вдалося розпарсити JSON:', err);
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
                    {text: '✅ Все вірно', callback_data: 'confirm_correct'},
                    {text: '❌ Скасувати', callback_data: 'cancel_all'}
                ]
            ]
        }
    });
}


function formatShippingInfo(data) {
    logger.info(data)
    const {
        from,
        to,
        weight,
        volume
    } = JSON.parse(data);

    return `*Деталі вантажу:*
🚢 *Відправлення:* ${from.value}
📍 *Призначення:* ${to.value}
⚖️ *Вага:* ${weight.value} кг
📐 *Обʼєм:* ${volume.value} м³

⏳ Розраховую вартість...`;
}


function formatShippingResult(data) {
    // console.log(data)

    return `*Деталі вантажу:*
🚢 *Відправлення:* ${data.Origin}
📍 *Призначення:* ${data.Destination}
⚖️ *Вага:* ${data.Weight} кг
📐 *Обʼєм:* ${data.Volume} м³


*Розрахунок:*
🚚 *Доставка через склад (${data.StorageCFS}):* ${data.TotalRateCFS} $
🚪 *Доставка по ПД:* ${data.TotalRatePD === 'please contact the manager' ? 'будь ласка, зв\'яжіться з менеджером' : `${data.TotalRatePD}$`} 
${data.OnlyStorageCFS 
        ? '\n\n\nЗверніть увагу! Доставка відбудеться тільки до складу, вказаному у призначенні. За детальною інформацією зверніться до менеджера.' 
        : ''
    }
`
}


async function data1CHandler(reply, chatId, bot, processingMsg, sessionState, sessionMap, data1CMap) {
    const {from, to, volume, weight, language} = JSON.parse(reply);
    let lng

    if(!language) lng = {value: 'uk-UA', confidence: true}
    else lng = language

    logger.info('==================== USER LANGUAGE =============================')
    logger.info(lng)
    logger.info('==================== USER LANGUAGE =============================')

    if (!from.value || !to.value || !volume.value || !weight.value) {
        return bot.sendMessage(chatId, 'Проблема з прорахунком. Немає всіх даних!');
    }

    if (volume.value > 50 || weight.value > 12000) {
        return bot.sendMessage(chatId, 'Будь ласка зв`яжіться з вашим менеджером для актуального прорахунку');
    }

    const aiData = JSON.parse(reply);

    data1CMap.set(chatId, aiData);

    const data = {
        "type": 'LCL_Settlement',
        "Origin": aiData.from.value,
        "Destination": aiData.to.value,
        "Volume": aiData.volume.value.toString(),
        "Weight": aiData.weight.value.toString(),
        "userId": chatId
    }

    const resultPrice = await connectTo1C(data);
    logger.info('============RESULT FORM 1C===============')
    logger.info(resultPrice)
    logger.info('============RESULT FORM 1C===============')


    if (resultPrice.status === 'ok' && resultPrice.successfully) {
        // const text = formatShippingResult(resultPrice);

        const {status, successfully, Rate, ...result} = resultPrice;

        result.TotalRateCFS = Rate.TotalRateCFS;
        result.TotalRatePD = Rate.TotalRatePD;
        result.StorageCFS = Rate?.StorageCFS || '';
        result.OnlyStorageCFS = Rate?.OnlyStorageCFS;

        if(!Rate.PDDeliveryOk)
            result.TotalRatePD = 'please contact the manager'


        const storage = Rate?.StorageCFS === 'Львів' ? 'LVIV' : 'KYIV';
        if(Rate.OnlyStorageCFS){
            result.Destination = storage;
        }

        if(lng.value === 'uk-UA') {
            result.Origin = getUkrainianName(ports, result.Origin)
            result.Destination = getUkrainianName(ports, result.Destination)
        }

        if (sessionState === 'awaiting_gpt_audio') {
            const prompt = getPromptResponse(JSON.stringify(result), lng.value, Rate.OnlyStorageCFS, storage);

            const gptResponse = await openai.chat.completions.create({
                model: text_model,
                messages: [{role: 'user', content: prompt}]
            });

            const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

            logger.info(replyGPT)

            await createAudio(bot, replyGPT, chatId, lng);
            return await sendInfo(bot, chatId, sessionMap, Rate.Cost_items);
        } else {
            const formatedText = formatShippingResult(result)

            if (processingMsg) {
                await bot.editMessageText(formatedText, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                })
            } else await bot.sendMessage(chatId, formatedText, {parse_mode: 'Markdown'})
            return await sendInfo(bot, chatId, sessionMap, Rate.Cost_items);
        }


        // await createAudio(bot, replyGPT, chatId);
    }

    if (resultPrice.status === 'NOT OK') {
        await bot.sendMessage(chatId, 'Проблема з прорахунком. Спробуйте пізніше!',);
    } else {


    }
}

async function createAudio(bot, text, chatId, language) {
    const isSupportedLanguage = supportedLanguages.includes(language.value);

    let languageCode = 'en-US';
    if (isSupportedLanguage) languageCode = language.value;


    const API_KEY = process.env.GEMINI_API_KEY;

    const ai = new GoogleGenAI({
        apiKey: API_KEY,
    });
    const config = {
        temperature: 1,
        responseModalities: [
            'audio',
        ],
        speechConfig: {
            voiceConfig: {
                languageCode,
                prebuiltVoiceConfig: {
                    voiceName: 'Leda',
                }
            }
        },
    };
    const model = 'gemini-2.5-flash-preview-tts';
    const contents = [
        {
            role: 'user',
            parts: [
                {text},
            ],
        },
    ];

    const response = await ai.models.generateContentStream({
        model,
        config,
        contents,
    });
    let fileIndex = 0;
    for await (const chunk of response) {
        if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
            continue;
        }
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            // const fileName = `ENTER_FILE_NAME_${fileIndex++}`;
            const inlineData = chunk.candidates[0].content.parts[0].inlineData;
            // let fileExtension = mime.getExtension(inlineData.mimeType || '');
            let fileExtension = mime.extension(inlineData.mimeType || ''); // <--- ЗМІНА ТУТ

            let buffer = Buffer.from(inlineData.data || '', 'base64');
            if (!fileExtension) {
                fileExtension = 'wav';
                buffer = convertToWav(inlineData.data || '', inlineData.mimeType || '');
            }
            const fileName = `voice_${uuidv4()}.wav`;
            const filePath = `./${fileName}`;
            fs.writeFileSync(filePath, buffer);

            try {
                // Directly send the audio buffer to Telegram
                await bot.sendVoice(chatId, fs.createReadStream(filePath));
                logger.info(`Audio sent to Telegram bot.`);
            } catch (telegramError) {
                logger.error(`Error sending audio to Telegram:`, telegramError);
            }

            fs.unlinkSync(filePath);
        }
        else {
            logger.info(chunk.text);
        }
    }
}

function cleanText(text) {
    let cleaned = text.replace(/\*/g, '');

    cleaned = cleaned.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])/g, '');

    return cleaned.trim();
}

async function sendInfo(bot, chatId, sessionMap, cost_items) {
    sessionMap.set(chatId, 'awaiting_data1c')

    const validityDate = getValidityPeriod();
    const attentionInfo = `Створити OFFER? (ціна актуальна до ${validityDate})`;

    return bot.sendMessage(chatId, attentionInfo, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    {text: '✅ Підтвердити', callback_data: 'data1c_confirm'},
                    {text: '❌ Скасувати', callback_data: 'data1c_cancel'}
                ],
                [
                    {text: 'Обов`язково для ознайомлення', callback_data: 'data1c_info'},
                ],
                [
                    {text: 'Статті витрат', callback_data: `data1c_article__${JSON.stringify(cost_items)}`},
                ],
            ],
        },
    });
}

const getUkrainianName = (array, englishName) => {
    const found = array.find(item => item.value.toUpperCase() === englishName.toUpperCase());
    return found ? found.text : englishName;
};


module.exports = {
    getPrompt,
    handleAudio,
    handleText,
    handlePhoto,
    handleCorrection,
    formatShippingInfo,
    formatShippingResult,
    data1CHandler
};
