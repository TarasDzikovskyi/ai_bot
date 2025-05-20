const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fuzz = require('fuzzball');
const { ports, cities } = require('../constants');


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


function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}


function isLikelyOrder(text) {
    const keywords = [
        'доставка', 'порт', 'море', 'контейнер', 'порту', 'міста', 'кубів', 'куба', 'куб',
        'відправка', 'обʼєм', 'вага', 'м³', 'кг', 'місто', 'кілограмів', 'кілограм',
        'to', 'from', 'shipment', 'cargo', 'volume', 'weight', 'city'
    ];

    const lowerText = text.toLowerCase();

    return keywords.some(word => lowerText.includes(word));
}


function normalizeTextWithFuzzyMatch(text) {
    let normalizedText = text;

    // const portNames = ports.map(p => p.text);
    // const cityNames = cities.map(c => c.text);

    const portNames = ports.flatMap(p => [p.text, p.value]);
    const cityNames = cities.flatMap(p => [p.text, p.value]);

    const words = text.split(/[\s,.;()!?]+/); // розбити текст на слова

    for (const word of words) {
        if(word.toLowerCase() !== 'дай'){
            // Пошук серед портів
            const [bestPortMatch, portScore] = fuzz.extract(word, portNames, { scorer: fuzz.ratio, returnObjects: false })[0];
            if (portScore >= 70) {
                const reg = new RegExp(word, 'gi');
                normalizedText = normalizedText.replace(reg, bestPortMatch);
            }

            // Пошук серед міст
            const [bestCityMatch, cityScore] = fuzz.extract(word, cityNames, { scorer: fuzz.ratio, returnObjects: false })[0];
            if (cityScore >= 70) {
                const reg = new RegExp(word, 'gi');
                normalizedText = normalizedText.replace(reg, bestCityMatch);
            }
        }
    }

    return normalizedText;
}


function normalizeFromTo(input) {
    const result = {
        ...input, // копіюємо всі поля
        from: {
            ...input.from,
            value: null,
            confidence: false
        },
        to: {
            ...input.to,
            value: null,
            confidence: false
        }
    };

    // normalize from
    if (input.from?.value) {
        const match = ports.find(p =>
            p.text.toLowerCase() === input.from.value.toLowerCase() ||
            p.value.toLowerCase() === input.from.value.toLowerCase()
        );

        if (match) {
            result.from.value = match.value;
            result.from.confidence = true;
        }
    }

    // normalize to
    if (input.to?.value) {
        const match = cities.find(c =>
            c.text.toLowerCase() === input.to.value.toLowerCase() ||
            c.value.toLowerCase() === input.to.value.toLowerCase()
        );

        if (match) {
            result.to.value = match.value;
            result.to.confidence = true;
        }
    }

    return result;
}


module.exports = {
    downloadFile,
    chunkArray,
    isLikelyOrder,
    normalizeTextWithFuzzyMatch,
    normalizeFromTo
};