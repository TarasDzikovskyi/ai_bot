// const JSONdb = require('simple-json-db');
// const db = new JSONdb('people.json');
//
// let option = {
//     "parse_mode": "Markdown",
//     "reply_markup": {
//         "one_time_keyboard": true,
//         "keyboard": [[{
//             text: "Номер телефону",
//             request_contact: true
//         }], ["Скасувати"]]
//     }
// };
//
// function setupCommandHandlers(bot) {
//     // Handle /start command
//     bot.onText(/\/start/, (msg) => {
//         const chatId = msg.chat.id;
//         const db_user = db.get(chatId);
//         console.log(db_user)
//
//         if (!db_user) {
//             bot.sendMessage(chatId, `Поділіться, будь ласка, контактом для підтвердження особи`, option)
//         } else {
//             bot.sendMessage(chatId, 'Привіт! Оберіть дію:', {
//                 reply_markup: {
//                     keyboard: [
//                         ['🔊 Надіслати аудіо', '📝 Надіслати текст'],
//                         ['📦 Прорахувати вантаж', 'ℹ️ Допомога'],
//                         ['🏙️ Список міст', '🚢 Список портів']
//                     ],
//                     resize_keyboard: true,
//                     one_time_keyboard: false
//                 }
//             });
//         }
//     });
//
//
//     bot.onText(/\/search/, (msg) => {
//         const chatId = msg.chat.id;
//         const db_user = db.get(chatId);
//         console.log(db_user)
//
//         if (!db_user) {
//             bot.sendMessage(chatId, `Поділіться, будь ласка, контактом для підтвердження особи`, option)
//         } else {
//             bot.sendMessage(chatId, 'Натисни кнопку для пошуку:', {
//                 reply_markup: {
//                     inline_keyboard: [[
//                         {
//                             text: '🔍 Пошук порту',
//                             switch_inline_query_current_chat: 'port '
//                         },
//                         {
//                             text: '🔍 Пошук міста',
//                             switch_inline_query_current_chat: 'city '
//                         }
//                     ]]
//                 }
//             });
//         }
//
//     });
// }
//
// module.exports = {
//     setupCommandHandlers
// };