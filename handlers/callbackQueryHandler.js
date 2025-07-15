const { showItemsPage } = require('../utils/pagination');
const {formatShippingInfo, data1CHandler} = require("../services/openai.service");
const {connectTo1C} = require("../services/data1C.service");
const constants = require("../constants");
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');

function setupCallbackQueryHandler(bot, userState, dialogStates, sessionMap, data1CMap, dataArticle1CMap) {
    bot.on('callback_query', async (query) => {
        const chatId = query?.message?.chat?.id || query?.from?.id;
        const user = userState.get(chatId);
        const state = dialogStates.get(chatId);
        const sessionState = sessionMap.get(chatId);
        const data1CState = data1CMap.get(chatId);

        if(sessionState === 'data1c_contact') sessionMap.delete(chatId);


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
            sessionMap.set(chatId, 'correction')
            await bot.sendMessage(chatId, 'Будь ласка, надішліть нове аудіо або текст із уточненнями.');
        }

        else if (query.data === 'edit_no') {
            userState.delete(chatId);
            sessionMap.delete(chatId)
            await bot.sendMessage(chatId, 'Добре, обробку скасовано.');
        }

        else if (query.data === 'confirm_correct') {
            logger.info('+++++++++++++++++++++++++++')
            logger.info(user)
            logger.info('+++++++++++++++++++++++++++')

            if (!user) {
                await bot.sendMessage(chatId, 'Помилка: дані користувача не знайдено. Спробуйте ще раз.');
                return;
            }

            const userData = user?.correctedData || user?.originalData;
            logger.info('➡️ Надсилаємо в 1С:', userData);

            if (!userData) {
                await bot.sendMessage(chatId, 'Помилка: дані для відправки не знайдено. Спробуйте ще раз.');
                return;
            }

            const reply = typeof userData === 'string' ? userData : JSON.stringify(userData);

            const data = formatShippingInfo(reply);
            const processingMsg = await bot.sendMessage(chatId, data, { parse_mode: 'Markdown' });
            await data1CHandler(reply, chatId, bot, processingMsg, sessionState, sessionMap, data1CMap, dataArticle1CMap);
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
                await data1CHandler(reply, chatId, bot, null, sessionState, sessionMap, data1CMap, dataArticle1CMap);

                dialogStates.delete(chatId); // Очистити стан
            }
        }

        else if (query.data === 'cancel') {
            dialogStates.delete(chatId);
            await bot.sendMessage(chatId, '❌ Прорахунок скасовано.');
        }

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

        else if (query.data === 'noop') {
            // Do nothing, just answer the callback query
        }

        else if (query.data === 'data1c_confirm') {
            if(sessionState === 'awaiting_data1c'){
                sessionMap.delete(chatId);

                logger.info(data1CState)

                const data = {
                    type: "Create_Report",
                    "Origin": data1CState.from.value,
                    "Destination": data1CState.to.value,
                    "Volume": data1CState.volume.value.toString(),
                    "Weight": data1CState.weight.value.toString(),
                    userId: chatId
                }

                data1CMap.delete(chatId);
                const response = await connectTo1C(data);

                logger.info('===================CREATE REPORT 1C===================');
                logger.info(response);
                logger.info('===================CREATE REPORT 1C===================');

                if (response.status === 'ok') {
                    const data = {
                        "doc_id": response.doc_id,
                        "doc_num": response.doc_num,
                    }
                    data1CMap.set(chatId, data);
                    sessionMap.set(chatId, 'data1c_contact');
                    await bot.sendMessage(chatId, 'Дякуємо, заявку сформовано.')
                    await bot.sendMessage(chatId, 'Надішліть в наступному повідомленні контактні дані відправника.')
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

        else if (query.data.startsWith('data1c_article')) {
            const data = dataArticle1CMap.get(chatId)

            await bot.editMessageReplyMarkup({
                inline_keyboard: [
                    [
                        {text: '✅ Підтвердити', callback_data: 'data1c_confirm'},
                        {text: '❌ Скасувати', callback_data: 'data1c_cancel'}
                    ],
                    [
                        {text: 'Обов`язково для ознайомлення', callback_data: 'data1c_info'},
                    ],
                    [
                        {text: '✅ Статті переглянуто', callback_data: 'used'}
                    ]
                ]
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });


            const message = `1. Ціна фрахту: ${data.SeaFreight === '' ? 'немає' : data.SeaFreight+'$'}
2. Ціна авто перевозки зі складу до дверей: ${data.CFSDoor === '' ? 'немає' : data.CFSDoor+'$'}
3. Delivery order:  ${data.Delivery === '' ? 'немає' : data.Delivery+'$'}
4. Т1: ${data.T1 === '' ? 'немає' : data.T1+'$'}
5. Ціна авто склад - склад:${data.CFSDelivery === '' ? 'немає' : data.CFSDelivery+'$'}
6. Ціна доставки по ПД: ${data.PDDelivery === '' ? 'немає' : data.PDDelivery+'$'}
`;

            await bot.sendMessage(chatId, message)

            dataArticle1CMap.delete(chatId);
        }

        else if (query.data.startsWith('booking_')) {
            const parts = query.data.split('_');
            const docId = parts[1];

            const data = {
                type: "Approve_Booking",
                userId: chatId,
                doc_id: docId,
            }

            const response = await connectTo1C(data);

            logger.info('===================BOOKING 1C===================');
            logger.info(response);
            logger.info('===================BOOKING 1C===================');


            await bot.editMessageReplyMarkup({
                inline_keyboard: [
                    [{text: '✅ Розміщено', callback_data: 'used'}]
                ]
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        }

        else if (query.data === 'cancel_booking') {

            await bot.editMessageReplyMarkup({
                inline_keyboard: [
                    [{text: '❌ Скасовано', callback_data: 'used'}]
                ]
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        }

        await bot.answerCallbackQuery(query.id);
    });
}

module.exports = {
    setupCallbackQueryHandler
};
