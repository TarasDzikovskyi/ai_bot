const { chunkArray } = require('./utils');
const { ports, cities } = require('../constants');


function showItemsPage(bot, chatId, page, type, itemType = 'port') {
    const items = itemType === 'port' ? ports : cities;
    const ITEMS_PER_PAGE = 22; // Show items per page (can be adjusted)
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    // Ensure page is within valid range
    page = Math.max(0, Math.min(page, totalPages - 1));

    // Get items for current page
    const startIdx = page * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, items.length);
    const pageItems = items.slice(startIdx, endIdx);

    // Create buttons for items
    const itemButtons = pageItems.map(p => {
        let callbackData;
        if (type === 'list') {
            callbackData = 'noop'; // No operation for list view
        } else if (itemType === 'port') {
            callbackData = type === 'departure' ? `port:${p.value}` : `destination_port:${p.value}`;
        } else {
            callbackData = `city:${p.value}`;
        }
        return { text: p.text, callback_data: callbackData };
    });

    // Create navigation buttons
    const navButtons = [];
    if (page > 0) {
        navButtons.push({ text: '⬅️ Назад', callback_data: `page:${type}:${page - 1}:${itemType}` });
    }

    // Add page indicator
    navButtons.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });

    if (page < totalPages - 1) {
        navButtons.push({ text: 'Далі ➡️', callback_data: `page:${type}:${page + 1}:${itemType}` });
    }

    // Create keyboard with item buttons and navigation
    const inlineKeyboard = [
        ...chunkArray(itemButtons, 2),
        navButtons
    ];

    let message;
    if (type === 'list') {
        message = itemType === 'port' ? 'Список доступних портів:' : 'Список доступних міст:';
    } else if (itemType === 'port') {
        message = type === 'departure' ? 'Оберіть порт завантаження:' : 'Оберіть порт призначення:';
    } else {
        message = 'Оберіть місто доставки:';
    }

    return bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: inlineKeyboard,
        },
    });
}

module.exports = {
    showItemsPage
};