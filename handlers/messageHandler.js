const { showItemsPage } = require('../utils/pagination');
const { isLikelyOrder } = require('../utils/utils');
const { handleAudio, handleText, handleCorrection } = require('../services/openai.service');

/**
 * Sets up the message handler for the bot
 * @param {Object} bot - The Telegram bot instance
 * @param {Map} userState - The user state map
 * @param {Map} dialogStates - The dialog states map
 * @param {Map} sessionMap - The session map
 */
function setupMessageHandler(bot, userState, dialogStates, sessionMap) {
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

        console.log(msg);

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
                await bot.sendMessage(chatId, 'Надішли голосове повідомлення з інформацією про замовлення.');
                return;
            }

            if (msg.text === '📝 Надіслати текст') {
                sessionMap.set(chatId, 'awaiting_gpt_input');
                await bot.sendMessage(chatId, 'Будь ласка, введіть текст замовлення на прорахунок вантажу.');
                return;
            }

            if (msg.text === '📦 Прорахувати вантаж') {
                dialogStates.set(chatId, { step: 'awaitingPort', portPage: 0 });
                return showItemsPage(bot, chatId, 0, 'departure', 'port');
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
                return showItemsPage(bot, chatId, 0, 'list', 'city');
            }

            if (msg.text === '🚢 Список портів') {
                return showItemsPage(bot, chatId, 0, 'list', 'port');
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
