const {showItemsPage} = require('../utils/pagination');
const {isLikelyOrder} = require('../utils/utils');
const {handleAudio, handleText, handleCorrection} = require('../services/openai.service');
const {ports, cities, allowedTextCommands} = require('../constants')
const JSONdb = require('simple-json-db');
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');
const {connectTo1C} = require('../services/data1C.service')

let option = {
    "parse_mode": "Markdown",
    "reply_markup": {
        "one_time_keyboard": true,
        "keyboard": [[{
            text: "Номер телефону",
            request_contact: true
        }], ["Скасувати"]]
    }
};

const normalizePort = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizeCity = (str) => str.normalize("NFC").toLowerCase().replace(/[^\p{L}\d\s]/gu, '').toLowerCase();

async function setupMessageHandler(bot, userState, dialogStates, sessionMap, data1CMap) {
    bot.on('inline_query', (query) => {
        const userId = query.from.id;
        const userState = dialogStates.get(userId);

        const rawQuery = query.query.trim();
        const searchText = rawQuery.toLowerCase();

        let showConfirmButton = false;
        if (userState && (userState.step === 'awaitingPort' || userState.step === 'choosingDestination')) {
            showConfirmButton = true;
        }

        let results = [];

        if (searchText.startsWith('port ')) {
            const keyword = normalizePort(searchText.replace('port ', '').trim());

            results = ports
                .filter(item =>
                    normalizePort(item.text).includes(keyword) ||
                    item.value.toLowerCase().includes(keyword)
                )
                .slice(0, 20)
                .map((item, index) => {
                    const baseResult = {
                        type: 'article',
                        id: `port-${index}`,
                        title: `Порт: ${item.text} (${item.value})`,
                        input_message_content: {
                            message_text: `Обрано порт: ${item.text} (${item.value})`
                        },
                        description: `Код: ${item.code}`
                    };

                    if (showConfirmButton) {
                        baseResult.reply_markup = {
                            inline_keyboard: [[
                                {
                                    text: 'Підтвердити?',
                                    callback_data: `port:${item.value}`
                                }
                            ]]
                        };
                    }

                    return baseResult;
                });

        } else if (searchText.startsWith('city ')) {
            const keyword = normalizeCity(searchText.replace('city ', '').trim());

            results = cities
                .filter(item =>
                    normalizeCity(item.text).includes(keyword) ||
                    item.value.toLowerCase().includes(keyword)
                )
                .slice(0, 20)
                .map((item, index) => {
                    const baseResult = {
                        type: 'article',
                        id: `city-${index}`,
                        title: `Місто: ${item.text} (${item.value})`,
                        input_message_content: {
                            message_text: `Обрано місто: ${item.text} (${item.value})`
                        }
                        // description можна додати, якщо треба
                    };

                    if (showConfirmButton) {
                        baseResult.reply_markup = {
                            inline_keyboard: [[
                                {
                                    text: 'Підтвердити?',
                                    callback_data: `city:${item.value}`
                                }
                            ]]
                        };
                    }

                    return baseResult;
                });
        } else {
            // Нічого не знайдено або не вказано порт/місто
            results = [{
                type: 'article',
                id: 'empty',
                title: 'Вкажи "port" або "city" (якщо не вказано)',
                input_message_content: {
                    message_text: 'Напиши `port Одеса` або `city Київ`'
                },
                description: 'Щоб знайти порт або місто — введи "port ..." або "city ..."'
            }];
        }

        bot.answerInlineQuery(query.id, results);
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = dialogStates.get(chatId);
        const sessionState = sessionMap.get(chatId);
        const user = userState.get(chatId);
        const contact = msg.contact;

        logger.info(msg.text)
        logger.info(chatId)

        if(!chatId) return


        const db = new JSONdb('people.json');
        const db_user = db.get(chatId);
        logger.info(db_user)

        if (contact) {
            if (!contact.phone_number.includes('+')) contact.phone_number = `+${contact.phone_number}`;

            const db_person = db.get(contact.user_id);

            logger.info(db_person)

            if (!db_person) {
                let person = {};
                person['id'] = contact.user_id;
                person['name'] = `${contact.first_name} ${contact.last_name}`;
                person['phone_number'] = contact.phone_number;

                await bot.sendMessage(chatId, 'Дякуємо! Очікуйте підтвердження.')

                const aiData = {
                    "type":"LCL_SetUser",
                    "user": person
                }

                // return
                return await connectTo1C(aiData);
            }
        }


        try {
            if (msg.text === '/start') {
                if (!db_user) {
                    return bot.sendMessage(chatId, `Поділіться, будь ласка, контактом для підтвердження особи`, option)
                } else {
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    return bot.sendMessage(chatId, 'Привіт, я AI сейлз🤖 Boxline Ukraine. Буду радий надати найкращу ціну згідно Вашого запиту😃. Надішліть текст📝 або аудіо🎤 повідомлення у довільній формі з параметрами вантажу для прорахунку🚢. Вкажіть обов`язково звідки відправка⚓️ і куди доставка🚚 вага об`єм, тариф дається завжди на умовах фоб.', {
                        reply_markup: {
                            keyboard: [
                                // ['🔊 Надіслати аудіо', '📝 Надіслати текст'],
                                ['📦 Прорахувати вантаж', 'ℹ️ Допомога'],
                                ['🏙️ Список міст', '🚢 Список портів']
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false
                        }
                    });
                }
            }

            if (msg.text === '/search') {
                if (!db_user) {
                    return bot.sendMessage(chatId, `Поділіться, будь ласка, контактом для підтвердження особи`, option)
                } else {
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    return bot.sendMessage(chatId, 'Натисніть кнопку для пошуку:', {
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '🔍 Пошук порту',
                                    switch_inline_query_current_chat: 'port '
                                },
                                {
                                    text: '🔍 Пошук міста',
                                    switch_inline_query_current_chat: 'city '
                                }
                            ]]
                        }
                    });
                }
            }


            if (db_user) {
                if(sessionState !== 'correction' && sessionState !== 'data1c_contact' && !state && !allowedTextCommands.includes(msg.text) && !msg.voice && !msg.audio){
                    sessionMap.set(chatId, 'awaiting_gpt_input');
                    await handleText(bot, msg.text, chatId, sessionMap, data1CMap);
                }

                if (sessionState !== 'correction' && (msg.voice || msg.audio)) {
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    sessionMap.set(chatId, 'awaiting_gpt_audio');
                    await handleAudio(bot, msg, chatId, userState, sessionMap, data1CMap);
                }

                logger.info('=======================================USER===========================================')
                if(user && user.datetime) {
                    const oneMinute = 60 * 1000;
                    const isOlderThanOneMinute = Date.now() - user.timestamp > oneMinute;
                    if (isOlderThanOneMinute) {
                        logger.info(user)
                        userState.delete(chatId);
                    }
                }
                logger.info('=======================================USER===========================================')


                if (user && user.isEditing) {
                    if (msg.text || msg.voice || msg.audio) {
                        await handleCorrection(bot, msg, chatId, user, userState, sessionMap);
                        // Don't delete userState here as it's needed for the confirmation step
                        return;
                    } else {
                        await bot.sendMessage(chatId, 'Надішліль текст або аудіо з уточненням.');
                        return;
                    }
                }

                if (sessionState === 'data1c_contact') {
                    const data1CState = data1CMap.get(chatId);
                    sessionMap.delete(chatId);

                    if(!data1CState) return

                    logger.info(data1CState)

                    const data = {
                        type: "Send_Contact",
                        doc_id: data1CState.doc_id,
                        doc_num: data1CState.doc_num,
                        user: chatId,
                        contact_msg: msg.text
                    }

                    const response = await connectTo1C(data);

                    logger.info('===================CONTACT 1C===================');
                    logger.info(response);
                    logger.info('===================CONTACT 1C===================');

                    data1CMap.delete(chatId);

                    return bot.sendMessage(chatId, 'Дані відправлено. Дякуємо!', {
                        reply_markup: {
                            inline_keyboard: [[
                                {text: 'Розмістити booking?', callback_data: `booking_${data1CState.doc_id}`},
                                {text: 'Скасувати', callback_data: `cancel_booking`},
                            ]]
                        }
                    });
                }


                if (msg.text === '📦 Прорахувати вантаж') {
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    dialogStates.set(chatId, {step: 'awaitingPort', portPage: 0});
                    await showItemsPage(bot, chatId, 0, 'departure', 'port');

                    return bot.sendMessage(chatId, 'Або натисніть кнопку для пошуку:', {
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '🔍 Пошук порту',
                                    switch_inline_query_current_chat: 'port '
                                }
                            ]]
                        }
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

                    // Сценарій на введення ваги
                    if (state?.step === 'awaitingWeight') {
                        if (isNaN(parseFloat(msg.text))) return bot.sendMessage(chatId, 'Введіть коректну вагу (кг):');
                        state.weight = parseFloat(msg.text);
                        state.step = 'awaitingConfirmation';

                        const summary = `*Деталі вантажу:*
🚢 *Відправлення:* ${state.port}
📍 *Призначення:* ${state.city}
⚖️ *Вага:* ${state.weight} кг
📐 *Обʼєм:* ${state.volume} м³

Підтвердити замовлення?`;

                        return bot.sendMessage(chatId, summary, {
                            parse_mode: 'Markdown',
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
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    await bot.sendMessage(chatId, 'Надішли текст або голосове повідомлення, а бот обробить вашу інформацію і прорахує суму доставки. Якщо аудіо дані не точні — ти зможеш їх уточнити.');
                    return;
                }

                if (msg.text === '🏙️ Список міст') {
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    await showItemsPage(bot, chatId, 0, 'list', 'city');

                    return bot.sendMessage(chatId, 'Або натисни кнопку для пошуку:', {
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '🔍 Пошук міста',
                                    switch_inline_query_current_chat: 'city '
                                }
                            ]]
                        }
                    });
                }

                if (msg.text === '🚢 Список портів') {
                    if(sessionState === 'data1c_contact') sessionMap.delete(chatId);

                    await showItemsPage(bot, chatId, 0, 'list', 'port');

                    return bot.sendMessage(chatId, 'Або натисніть кнопку для пошуку:', {
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '🔍 Пошук порту',
                                    switch_inline_query_current_chat: 'port '
                                }
                            ]]
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('❌ Error:', error);
            bot.sendMessage(chatId, 'Сталася помилка при обробці повідомлення.');
        }
    });
}

module.exports = {
    setupMessageHandler
};


