const { showItemsPage } = require('../utils/pagination');

/**
 * Sets up the callback query handler for the bot
 * @param {Object} bot - The Telegram bot instance
 * @param {Map} userState - The user state map
 * @param {Map} dialogStates - The dialog states map
 */
function setupCallbackQueryHandler(bot, userState, dialogStates) {
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const user = userState.get(chatId);
        const state = dialogStates.get(chatId);

        if (query.data.startsWith('port:')) {
            const port = query.data.split(':')[1];
            if (state) {
                state.port = port;
                state.step = 'choosingDestination';
                state.portPage = 0;
                // Show cities directly without asking for destination type
                await showItemsPage(bot, chatId, 0, 'destination', 'city');
            }
        }

        // Add handler for city selection
        else if (query.data.startsWith('city:')) {
            const city = query.data.split(':')[1];
            if (state && state.step === 'choosingDestination') {
                state.city = city;
                state.destinationType = 'city'; // For backward compatibility
                state.step = 'awaitingVolume';
                await bot.sendMessage(chatId, 'Введіть обʼєм (м³):');
            }
        }

        else if (query.data.startsWith('destination_port:')) {
            const destinationPort = query.data.split(':')[1];
            if (state && (state.step === 'choosingDestinationPort' || state.step === 'choosingDestination')) {
                state.city = destinationPort;
                state.destinationType = 'port'; // For backward compatibility
                state.step = 'awaitingVolume';
                await bot.sendMessage(chatId, 'Введіть обʼєм (м³):');
            }
        }

        else if (query.data === 'edit_yes') {
            await bot.sendMessage(chatId, 'Будь ласка, надішли нове аудіо або текст із уточненнями.');
        }

        else if (query.data === 'edit_no') {
            userState.delete(chatId);
            await bot.sendMessage(chatId, 'Добре, обробку скасовано.');
        }

        else if (query.data === 'confirm_correct') {
            // Тут можна надіслати дані в 1С — поки заглушка
            console.log('➡️ Надсилаємо в 1С:', user?.correctedData || user?.originalData);

            await bot.sendMessage(chatId, '✅ Дані надіслано до 1С! Дякую.');
            userState.delete(chatId); // Очистити стан
        }

        else if (query.data === 'cancel_all') {
            await bot.sendMessage(chatId, '❌ Уточнення скасовано. Якщо потрібно, надішли нові дані.');
            userState.delete(chatId);
        }

        else if (query.data === 'confirm') {
            if (state?.step === 'awaitingConfirmation') {
                // Тут буде запит до 1С або інша логіка
                await bot.sendMessage(chatId, '🚀 Дані відправлено на прорахунок до 1С.\nОчікуйте відповідь менеджера.');
                dialogStates.delete(chatId); // Очистити стан
            }
        }

        // Скасування
        else if (query.data === 'cancel') {
            dialogStates.delete(chatId);
            await bot.sendMessage(chatId, '❌ Прорахунок скасовано.');
        }

        // Handle pagination
        else if (query.data.startsWith('page:')) {
            const parts = query.data.split(':');
            const type = parts[1];
            const pageStr = parts[2];
            const itemType = parts[3] || 'port'; // Default to 'port' for backward compatibility
            const page = parseInt(pageStr, 10);

            // For list type, we don't need a state
            if (type === 'list' || state) {
                // Update state if it exists
                if (state) {
                    state.portPage = page;
                }

                // Delete the previous message to avoid cluttering the chat
                await bot.deleteMessage(chatId, query.message.message_id);

                // Show the new page
                await showItemsPage(bot, chatId, page, type, itemType);
            }
        }

        // Handle no-operation button (page indicator)
        else if (query.data === 'noop') {
            // Do nothing, just answer the callback query
        }

        await bot.answerCallbackQuery(query.id);
    });
}

module.exports = {
    setupCallbackQueryHandler
};