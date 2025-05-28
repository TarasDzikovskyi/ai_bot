const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fuzz = require('fuzzball');
const { ports, cities, skipWords } = require('../constants');


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
        'to', 'from', 'shipment', 'cargo', 'volume', 'weight', 'city', 'місце доставки', 'місце', 'доставки',
        'kg', 'cbm', 'CBM', 'pallets', 'тонн', 'вартість', 'порахуй', 'ціну'
    ];

    const lowerText = text.toLowerCase();

    return keywords.some(word => lowerText.includes(word));
}


function normalizeTextWithFuzzyMatch2(text) {
    let normalizedText = text;

    // const portNames = ports.map(p => p.text);
    // const cityNames = cities.map(c => c.text);

    const portNames = ports.flatMap(p => [p.text, p.value]);
    const cityNames = cities.flatMap(p => [p.text, p.value]);

    const words = text.split(/[\s,.;()!?]+/); // розбити текст на слова

    for (const word of words) {
        if (!skipWords.includes(word.toLowerCase())) {
            // Пошук серед портів
            const [bestPortMatch, portScore] = fuzz.extract(word, portNames, { scorer: fuzz.ratio, returnObjects: false })[0];
            if (portScore >= 75) {
                const reg = new RegExp(word, 'gi');
                normalizedText = normalizedText.replace(reg, bestPortMatch);
            }

            // Пошук серед міст
            const [bestCityMatch, cityScore] = fuzz.extract(word, cityNames, { scorer: fuzz.ratio, returnObjects: false })[0];
            if (cityScore >= 75) {
                const reg = new RegExp(word, 'gi');
                normalizedText = normalizedText.replace(reg, bestCityMatch);
            }
        }
    }

    return normalizedText;
}

function normalizeTextWithFuzzyMatch(text) {
    let normalizedText = text;

    const allVariants = [];

    ports.forEach(port => {
        if (port.text) {
            allVariants.push({ searchText: port.text, value: port.value, type: 'port' });
        }
        if (port.value && port.value !== port.text) {
            allVariants.push({ searchText: port.value, value: port.value, type: 'port' });
        }
    });

    cities.forEach(city => {
        if (city.text) {
            allVariants.push({ searchText: city.text, value: city.value, type: 'city' });
        }
        if (city.value && city.value !== city.text) {
            allVariants.push({ searchText: city.value, value: city.value, type: 'city' });
        }
    });

    const words = text.split(/[\s,.;()!?]+/);

    for (const word of words) {
        if (!skipWords.includes(word.toLowerCase()) && word.length > 3) {
            const searchTexts = allVariants.map(v => v.searchText);

            const result = fuzz.extract(word, searchTexts, { scorer: fuzz.ratio, returnObjects: false });

            if (result.length > 0) {
                const [bestMatch, score] = result[0];

                if (score >= 75) {
                    const matchedVariant = allVariants.find(v => v.searchText === bestMatch);

                    console.log(matchedVariant)
                    if (matchedVariant) {
                        // const reg = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
                        const reg = new RegExp(word, 'gi');
                        normalizedText = normalizedText.replace(reg, matchedVariant.value);
                    }
                }
            }
        }
    }

    return normalizedText;
}


// Допоміжна функція для екранування спецсимволів у регулярних виразах
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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


function getValidityPeriod() {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1; // getMonth() повертає 0-11
    const year = today.getFullYear();

    let startDate, endDate;

    if (day <= 14) {
        // Якщо день від 1 до 14, валідність до 14 числа
        startDate = new Date(year, month - 1, day);
        endDate = new Date(year, month - 1, 14);
    } else {
        // Якщо день від 15 до кінця місяця, валідність до останнього дня місяця
        startDate = new Date(year, month - 1, day);
        endDate = new Date(year, month, 0); // 0-й день наступного місяця = останній день поточного
    }

    // Форматування дат у вигляді dd/mm
    const formatDate = (date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${d}/${m}`;
    };

    return `${formatDate(endDate)}`;
}


module.exports = {
    downloadFile,
    chunkArray,
    isLikelyOrder,
    normalizeTextWithFuzzyMatch,
    normalizeFromTo,
    getValidityPeriod,
};