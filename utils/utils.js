const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fuzz = require('fuzzball');
const { ports, cities, skipWords } = require('../constants');
const {writeFile} = require("fs");
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');

async function downloadFile(url, filename) {
    const directoryPath = path.join(__dirname, '..', 'audio');

    logger.info(directoryPath);
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

                    logger.info(matchedVariant)
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



function convertToWav(rawData, mimeType) {
    const options = parseMimeType(mimeType)
    const wavHeader = createWavHeader(rawData.length, options);
    const buffer = Buffer.from(rawData, 'base64');

    return Buffer.concat([wavHeader, buffer]);
}

function parseMimeType(mimeType) {
    const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
    const [_, format] = fileType.split('/');

    const options = {
        numChannels: 1,
    };

    if (format && format.startsWith('L')) {
        const bits = parseInt(format.slice(1), 10);
        if (!isNaN(bits)) {
            options.bitsPerSample = bits;
        }
    }

    for (const param of params) {
        const [key, value] = param.split('=').map(s => s.trim());
        if (key === 'rate') {
            options.sampleRate = parseInt(value, 10);
        }
    }

    return options;
}

function createWavHeader(dataLength, options) {
    const {
        numChannels,
        sampleRate,
        bitsPerSample,
    } = options;

    // http://soundfile.sapp.org/doc/WaveFormat

    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);                      // ChunkID
    buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
    buffer.write('WAVE', 8);                      // Format
    buffer.write('fmt ', 12);                     // Subchunk1ID
    buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
    buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);        // NumChannels
    buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
    buffer.writeUInt32LE(byteRate, 28);           // ByteRate
    buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
    buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
    buffer.write('data', 36);                     // Subchunk2ID
    buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

    return buffer;
}

function saveBinaryFile(fileName, content) {
    writeFile(fileName, content, 'utf8', (err) => {
        if (err) {
            logger.error(`Error writing file ${fileName}:`, err);
            return;
        }
        logger.info(`File ${fileName} saved to file system.`);
    });
}

module.exports = {
    downloadFile,
    chunkArray,
    isLikelyOrder,
    normalizeTextWithFuzzyMatch,
    normalizeFromTo,
    getValidityPeriod,
    convertToWav,
    saveBinaryFile
};