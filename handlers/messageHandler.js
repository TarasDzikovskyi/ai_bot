const { showItemsPage } = require('../utils/pagination');
const { isLikelyOrder } = require('../utils/utils');
const { handleAudio, handleText, handleCorrection } = require('../services/openai.service');
const {ports, cities} = require('../constants')

const normalizePort = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizeCity = (str) => str.normalize("NFC").toLowerCase().replace(/[^\p{L}\d\s]/gu, '').toLowerCase();

function setupMessageHandler(bot, userState, dialogStates, sessionMap) {
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

        if (user?.isEditing) {
            if (msg.text || msg.voice || msg.audio) {
                await handleCorrection(bot, msg, chatId, user, userState);
                // Don't delete userState here as it's needed for the confirmation step
                return;
            } else {
                await bot.sendMessage(chatId, 'Надішли текст або аудіо з уточненням.');
                return;
            }
        }

        // console.log(msg);

        try {
            if (sessionState === 'awaiting_gpt_input') {
                sessionMap.delete(chatId);

                if (isLikelyOrder(msg.text)) {
                    await handleText(bot, msg.text, chatId);
                } else {
                    await bot.sendMessage(chatId, 'Це повідомлення не схоже на запит щодо перевезення вантажу. Будь ласка, вкажіть деталі доставки.');
                }
            }

            if (sessionState === 'awaiting_gpt_audio') {
                sessionMap.delete(chatId);
                if (msg.voice || msg.audio) {
                    await handleAudio(bot, msg, chatId, userState);
                }
                // else await bot.sendMessage(chatId, 'Це не аудіо!')
            }

            if (msg.text === '🔊 Надіслати аудіо') {
                sessionMap.set(chatId, 'awaiting_gpt_audio');
                await bot.sendMessage(chatId, 'Надішліть голосове повідомлення з інформацією про замовлення.');
                return;
            }

            if (msg.text === '📝 Надіслати текст') {
                sessionMap.set(chatId, 'awaiting_gpt_input');
                await bot.sendMessage(chatId, 'Будь ласка, введіть текст замовлення на прорахунок вантажу.');
                return;
            }

            if (msg.text === '📦 Прорахувати вантаж') {
                dialogStates.set(chatId, { step: 'awaitingPort', portPage: 0 });
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
                                    { text: '✅ Підтвердити', callback_data: 'confirm' },
                                    { text: '❌ Скасувати', callback_data: 'cancel' }
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

            if (msg.text === '🏙️ Список міст') {
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
        } catch (error) {
            console.error('❌ Error:', error);
            bot.sendMessage(chatId, 'Сталася помилка при обробці повідомлення.');
        }
    });
}

module.exports = {
    setupMessageHandler
};
