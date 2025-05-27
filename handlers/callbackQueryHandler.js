const { showItemsPage } = require('../utils/pagination');
const {formatShippingInfo, data1CHandler} = require("../services/openai.service");
const {connectTo1C} = require("../services/data1C.service");
const constants = require("../constants");


function setupCallbackQueryHandler(bot, userState, dialogStates, sessionMap, data1CMap) {
    bot.on('callback_query', async (query) => {
        const chatId = query?.message?.chat?.id || query?.from?.id;
        const user = userState.get(chatId);
        const state = dialogStates.get(chatId);
        const sessionState = sessionMap.get(chatId);
        const data1CState = data1CMap.get(chatId);


        if (query.data.startsWith('port:')) {
            const port = query.data.split(':')[1];
            if (state) {
                state.port = port;
                state.step = 'choosingDestination';
                state.portPage = 0;
                // Show cities directly without asking for destination type
                await showItemsPage(bot, chatId, 0, 'destination', 'city');
                await bot.sendMessage(chatId, 'Або натисніть кнопку для пошуку:', {
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
        }

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
            await bot.sendMessage(chatId, 'Будь ласка, надішліть нове аудіо або текст із уточненнями.');
        }

        else if (query.data === 'edit_no') {
            userState.delete(chatId);
            await bot.sendMessage(chatId, 'Добре, обробку скасовано.');
        }

        else if (query.data === 'confirm_correct') {
            console.log('+++++++++++++++++++++++++++')
            console.log(user)
            console.log('+++++++++++++++++++++++++++')

            if (!user) {
                await bot.sendMessage(chatId, 'Помилка: дані користувача не знайдено. Спробуйте ще раз.');
                return;
            }

            const userData = user?.correctedData || user?.originalData;
            console.log('➡️ Надсилаємо в 1С:', userData);

            if (!userData) {
                await bot.sendMessage(chatId, 'Помилка: дані для відправки не знайдено. Спробуйте ще раз.');
                return;
            }

            const reply = typeof userData === 'string' ? userData : JSON.stringify(userData);

            const data = formatShippingInfo(reply);
            const processingMsg = await bot.sendMessage(chatId, data, { parse_mode: 'Markdown' });
            await data1CHandler(reply, chatId, bot, processingMsg, sessionState, sessionMap, data1CMap);
            userState.delete(chatId); // Очистити стан
        }

        else if (query.data === 'cancel_all') {
            await bot.sendMessage(chatId, '❌ Уточнення скасовано. Якщо потрібно, надішли нові дані.');
            userState.delete(chatId);
        }

        else if (query.data === 'confirm') {
            if (state?.step === 'awaitingConfirmation') {
                const data = {
                    "from": {
                        "value": state.port,
                        "confidence": true
                    },
                    "to": {
                        "value": state.city,
                        "confidence": true
                    },
                    "weight": {
                        "value": state.weight,
                        "confidence": true
                    },
                    "volume": {
                        "value": state.volume,
                        "confidence": true
                    }
                }

                const reply = JSON.stringify(data);
                await data1CHandler(reply, chatId, bot, null, sessionState, sessionMap, data1CMap);

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

        else if (query.data === 'data1c_confirm') {
            if(sessionState === 'awaiting_data1c'){
                sessionMap.delete(chatId);

                console.log(data1CState)

                const data = {
                    type: "Create_Report",
                    "Origin": data1CState.from.value,
                    "Destination": data1CState.to.value,
                    "Volume": data1CState.volume.value.toString(),
                    "Weight": data1CState.weight.value.toString(),
                    userId: chatId
                }

                const response = await connectTo1C(data);

                console.log('===================CREATE REPORT 1C===================');
                console.log(response);
                console.log('===================CREATE REPORT 1C===================');

                if (response.status === 'ok') {
                    await bot.sendMessage(chatId, 'Дякуємо, заявку сформовано.')
                } else {
                    await bot.sendMessage(chatId, 'Помилка при формуванні заявки');
                }


            }
        }

        else if (query.data === 'data1c_cancel') {
            if(sessionState === 'awaiting_data1c'){
                sessionMap.delete(chatId);
                await bot.sendMessage(chatId, 'Добре, Заявку не буде сформовано.')
            }
        }

        else if (query.data === 'data1c_info') {
            await bot.sendMessage(chatId, constants.data1c_info)
        }

        await bot.answerCallbackQuery(query.id);
    });
}

module.exports = {
    setupCallbackQueryHandler
};
