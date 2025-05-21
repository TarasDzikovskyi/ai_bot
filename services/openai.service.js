const { OpenAI } = require('openai');
const fs = require('fs');
const { downloadFile, normalizeTextWithFuzzyMatch, normalizeFromTo, isLikelyOrder} = require('../utils/utils');
const {ports, cities} = require('../constants')
const {connectTo1C} = require('./data1C.service');
const {post} = require("axios");
const { v4: uuidv4 } = require('uuid');


// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const text_model = 'gpt-3.5-turbo';
// const text_model = 'gpt-4-turbo';
const audio_model = 'whisper-1';



function getPrompt(text) {
    console.log('=================================TEXT PROMPT==================================');
    console.log(text);
    console.log('=================================TEXT PROMPT==================================');

    const portList = ports.map(port => `"${port.text}"`).join(', ');
    const cityList = cities.map(city => `"${city.text}"`).join(', ');

    return `
Ти — досвідчений логістичний асистент. Твоя задача — проаналізувати текст замовлення на перевезення вантажу (наприклад, отриманий з голосового повідомлення) та витягнути з нього ключову інформацію про маршрут і характеристики вантажу.

📦 Працюй чітко за правилами:

🔹 **"from"** — порт відправлення
🔹 **"to"** — місто призначення
🔹 **"weight"** — вага у **кг**
🔹 **"volume"** — обʼєм у **м³**

---

🔍 **Правила перевірки:**

1. Усі порти (from) мають бути **тільки з цього списку**:
[${portList}]
2. Усі міста (to) мають бути **тільки з цього списку**:
[${cityList}]
3. Якщо порт або місто не входить до відповідного списку — **поверни "value": null, "confidence": false**
4. Якщо назва схожа, але написана з помилкою (наприклад, "Дзіндао" замість "Циндао") — спробуй знайти найближчий варіант зі списку й поверни його з '"confidence": true'. Якщо не впевнений — '"value": null', '"confidence": false'.

---

🧠 **Витягни результат у форматі JSON:**

\`\`\`json
{
  "from": {
    "value": "Назва порту УКРАЇНСЬКОЮ зі списку або null",
    "confidence": true | false
  },
  "to": {
    "value": "Назва міста УКРАЇНСЬКОЮ зі списку або null",
    "confidence": true | false
  },
  "weight": {
    "value": число у кг або null,
    "confidence": true | false
  },
  "volume": {
    "value": число у м³ або null,
    "confidence": true | false
  }
}
\`\`\`

---

⚠️ **Уточнення**:

- Якщо вказано "тона" — переведи у **кг** (1 тонна = 1000 кг) ВИЗНАЧАЙ ПРАВИЛЬНО
- Якщо вказано "літр" — не враховуй (поверни volume: null)
- Якщо вказано "м³", "куб", "кубічний метр" — враховуй як обʼєм
- Якщо не впевнений у значенні — краще повертай 'null' + 'confidence: false'
- Не додавай пояснень, коментарів, тексту — **тільки валідний JSON**

---

Ось текст замовлення:
"""${text}"""
`;
}

function getPromptResponse(text){

    const prompt = `
    Ось текст з даними:
"""${text}"""

Працюй чітко за правилами:

    ти досвідчена жінка логіст!
дай мені емоційно-насичену відповідь за цими даними в дуже позитивному ключі, щоб клієнт захотів замовити доставку товару!
використай дані для відповіді!
Важливо (
TotalRateCFS - доставка через склад в доларах $; 
TotalRatePD - доставка по ПД в доларах $;
Volume - вказано в м³;
Weight - вказано в кг
) 

Суму потрібно виділити жирним текстом однією "*", а не "**"
`

return prompt
}


async function handleAudio(bot, msg, chatId, userState, sessionMap) {
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
            language: "uk"
        });

        if (!transcription.text) {
            throw new Error('Не вдалося отримати текст з аудіо');
        }

        const text = transcription.text;
        console.log(text)

        // Форматування тексту
        const cleanedText = normalizeTextWithFuzzyMatch(text);

        if(!isLikelyOrder(cleanedText)){
            return bot.sendMessage(chatId, 'Це повідомлення не схоже на запит щодо перевезення вантажу. Будь ласка, вкажіть деталі доставки.');
        }

        // Використовуємо GPT для витягування інформації з тексту
        const prompt = getPrompt(cleanedText);

        const gptResponse = await openai.chat.completions.create({
            model: text_model,
            messages: [{ role: 'user', content: prompt }]
        });

        const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

        const cleanedParsed = normalizeFromTo(JSON.parse(replyGPT));
        const reply = JSON.stringify(cleanedParsed);



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


        console.log('===========================PARSED AUDIO===========================')
        console.log(parsed)
        console.log('===========================PARSED AUDIO===========================')


        if (!parsed.from.confidence || !parsed.to.confidence || !parsed.weight.confidence || !parsed.volume.confidence
        || !parsed.from.value || !parsed.to.value || !parsed.weight.value || !parsed.volume.value) {
            userState.set(chatId, {
                originalText: cleanedText,
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
            const message = await bot.sendMessage(chatId, data, { parse_mode: 'Markdown' });
            await data1CHandler(reply, chatId, bot, message, sessionState);
        }
    } catch (error) {
        console.error('❌ Error in audio processing:', error);
        await bot.editMessageText('Помилка при обробці аудіо. Спробуйте ще раз.', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
    }
}


async function handleText(bot, text, chatId, sessionMap) {
    const sessionState = sessionMap.get(chatId);
    sessionMap.delete(chatId);

    const cleanedText = normalizeTextWithFuzzyMatch(text);

    const prompt = getPrompt(cleanedText);

    const gptResponse = await openai.chat.completions.create({
        model: text_model,
        messages: [{ role: 'user', content: prompt }]
    });

    // console.log(gptResponse)

    const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

    const cleanedParsed = normalizeFromTo(JSON.parse(replyGPT));
    const reply = JSON.stringify(cleanedParsed);
    // console.log(reply)



    if(reply.includes('null') || reply.includes('false')){
        const obj = JSON.parse(reply);
        await bot.sendMessage(chatId, `Прорахунок неможливий.
${(!obj.from.value || !obj.from.confidence) ? 'Поле "порт відправлення" некоректне.' : ''}
${(!obj.to.value || !obj.to.confidence) ? 'Поле "місто призначення" некоректне.' : ''}
${(!obj.weight.value || !obj.weight.confidence) ? 'Поле "вага" некоректне.' : ''}
${(!obj.volume.value || !obj.volume.confidence) ? 'Поле "об`єм" некоректне.' : ''}
`);
    } else {
        const data = formatShippingInfo(reply);
        const processingMsg = await bot.sendMessage(chatId, data, { parse_mode: 'Markdown' });
        await data1CHandler(reply, chatId, bot, processingMsg, sessionState);
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
            model: audio_model,
            language: "uk"
        });

        console.log(transcription.text)
        newText = transcription.text;
    }

    const cleanedText = normalizeTextWithFuzzyMatch(newText);
    console.log(user);
    console.log(cleanedText);

    const combinedPrompt = `
Є початковий об'єкт замовлення з деякими некоректними даними (confidence: false) або (value: null):
"""${JSON.stringify(user.originalData)}"""

Решта полів (confidence: true) повинні **залишитись, які були**

Користувач уточнив наступне:
"""${cleanedText}"""
`;

    const prompt = getPrompt(combinedPrompt);

    const gptResponse = await openai.chat.completions.create({
        model: text_model,
        messages: [{ role: 'user', content: prompt }]
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
🚚 *Доставка через склад:* ${data.Rate.TotalRateCFS} $
🚪 *Доставка по ПД:* ${data.Rate.TotalRatePD} $
`;
}


async function data1CHandler(reply, chatId, bot, processingMsg, sessionState){
    const {from, to, volume, weight} = JSON.parse(reply);

    if(!from.value || !to.value || !volume.value || !weight.value){
        return bot.sendMessage(chatId, 'Проблема з прорахунком. Немає всіх даних!' );
    }

    if(volume.value > 50 || weight.value > 12000){
        return bot.sendMessage(chatId, 'Будь ласка зв`яжіться з вашим менеджером для актуального прорахунку' );
    }

    const aiData = JSON.parse(reply);

    const data = {
        "type": 'LCL_Settlement',
        "Origin": aiData.from.value,
        "Destination": aiData.to.value,
        "Volume": aiData.volume.value.toString(),
        "Weight": aiData.weight.value.toString(),
    }

    const resultPrice = await connectTo1C(data);
    console.log('============RESULT FORM 1C===============')
    console.log(resultPrice)
    console.log('============RESULT FORM 1C===============')


    if(resultPrice.status === 'ok' && resultPrice.successfully){
        // const text = formatShippingResult(resultPrice);

        const {status, successfully, Rate, ...result} = resultPrice;

        result.TotalRateCFS = Rate.TotalRateCFS;
        result.TotalRatePD = Rate.TotalRatePD;

        const prompt = getPromptResponse(JSON.stringify(result));

        const gptResponse = await openai.chat.completions.create({
            model: text_model,
            messages: [{ role: 'user', content: prompt }]
        });

        const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

        console.log(replyGPT)

        if(sessionState === 'awaiting_gpt_audio'){
            return await createAudio(bot, replyGPT, chatId);
        } else {
            if(processingMsg){
                await bot.editMessageText(replyGPT, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                })
            }else await bot.sendMessage(chatId, replyGPT, {parse_mode: 'Markdown'})
        }



        // await createAudio(bot, replyGPT, chatId);
    }

    if(resultPrice.status === 'NOT OK'){
        await bot.sendMessage(chatId, 'Проблема з прорахунком. Спробуйте пізніше!', );
    } else {



    }
}


async function createAudio(bot, text, chatId){
    try {

        const API_KEY = 'AIzaSyDYsyq_eRkG3ghAdaZ4IiWlBHvNpvReTA8';
        const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${API_KEY}`;

        const data = {
            audioConfig: {
                audioEncoding: "LINEAR16",
                effectsProfileId: ["small-bluetooth-speaker-class-device"],
                pitch: 0,
                speakingRate: 1
            },
            input: {
                text: cleanText(text)
            },
            voice: {
                languageCode: "uk-UA",
                name: "uk-UA-Chirp3-HD-Achernar"
            }
        };

        const response = await post(url, data);
        const audioContent = response.data.audioContent;

        if (!audioContent) throw new Error("Немає аудіо у відповіді.");

        // Зберігаємо тимчасовий файл
        const fileName = `voice_${uuidv4()}.wav`;
        const filePath = `./${fileName}`;
        fs.writeFileSync(filePath, Buffer.from(audioContent, 'base64'));

        // Надсилаємо як голосове повідомлення
        await bot.sendVoice(chatId, fs.createReadStream(filePath));

        // Видаляємо файл після надсилання
        fs.unlinkSync(filePath);
        console.log('Голосове повідомлення надіслано і файл видалено.');

        // const speechResponse = await openai.audio.speech.create({
        //     model: 'tts-1',
        //     voice: 'shimmer', // інші голоси: alloy, echo, fable, onyx, shimmer
        //     input: text,
        // });
        //
        // const buffer = Buffer.from(await speechResponse.arrayBuffer());
        // const filePath = `./voice_${chatId}.mp3`;
        // fs.writeFileSync(filePath, buffer);
        //
        // await bot.sendVoice(chatId, fs.createReadStream(filePath));
        //
        // fs.unlinkSync(filePath);
    } catch (e) {
        await bot.sendMessage(chatId, 'Проблема з прорахунком. Спробуйте пізніше!', );
        console.log(e)
    }
}

function cleanText(text) {
    let cleaned = text.replace(/\*/g, '');

    cleaned = cleaned.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF])/g, '');

    return cleaned.trim();
}

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
