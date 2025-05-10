/**
 * Sets up the command handlers for the bot
 * @param {Object} bot - The Telegram bot instance
 */
function setupCommandHandlers(bot) {
    // Handle /start command
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Привіт! Обери дію:', {
            reply_markup: {
                keyboard: [
                    ['🔊 Надіслати аудіо', '📝 Надіслати текст'],
                    ['📦 Прорахувати вантаж', 'ℹ️ Допомога'],
                    ['🏙️ Список міст', '🚢 Список портів']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    });
}

module.exports = {
    setupCommandHandlers
};