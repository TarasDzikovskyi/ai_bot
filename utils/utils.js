const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Downloads a file from a URL and saves it to the specified filename
 * @param {string} url - The URL of the file to download
 * @param {string} filename - The name to save the file as
 * @returns {Promise<string>} - The path to the downloaded file
 */
async function downloadFile(url, filename) {
    const directoryPath = path.join(__dirname, '..', 'audio');

    await fs.promises.mkdir(directoryPath, {recursive: true});

    const filePath = path.join(directoryPath, filename);

    const writer = fs.createWriteStream(filePath);

    const response = await axios.get(url, {responseType: 'stream'});
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}

/**
 * Splits an array into chunks of the specified size
 * @param {Array} array - The array to chunk
 * @param {number} size - The size of each chunk
 * @returns {Array} - The chunked array
 */
function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

/**
 * Checks if a text is likely to be an order based on keywords
 * @param {string} text - The text to check
 * @returns {boolean} - Whether the text is likely to be an order
 */
function isLikelyOrder(text) {
    const keywords = [
        'доставка', 'порт', 'море', 'контейнер',
        'відправка', 'обʼєм', 'вага', 'м³', 'кг', 'місто',
        'to', 'from', 'shipment', 'cargo', 'volume', 'weight', 'city'
    ];

    const lowerText = text.toLowerCase();

    return keywords.some(word => lowerText.includes(word));
}

/**
 * Creates a response text template
 * @returns {string} - The response text template
 */
function createResponseText() {
    const text = `🔍 Ваші дані:
    Порт завантаження: 
    Місце доставки:
    Вага вантажу:
    Обʼєм вантажу:

    На основі ваших даних було прораховано наступне: 
    Ціна до місця доставки:
    Ціна до дверей: `

    return text
}

module.exports = {
    downloadFile,
    chunkArray,
    isLikelyOrder,
    createResponseText
};