const fuzz = require('fuzzball');
const { ports, cities } = require('./constants');

function normalizeTextWithFuzzyMatch(text) {
    let normalizedText = text;

    // const portNames = ports.map(p => p.text);
    // const cityNames = cities.map(c => c.text);

    const portNames = ports.flatMap(p => [p.text, p.value]);
    const cityNames = cities.flatMap(p => [p.text, p.value]);

    const words = text.split(/[\s,.;()!?]+/); // розбити текст на слова

    for (const word of words) {
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

    return normalizedText;
}


// const text = 'Порт відправки gong kong місце доставки Дніпро 8 кубів 3 тонни';
// const cleanedText = normalizeTextWithFuzzyMatch(text, ports, cities);
// console.log(cleanedText);


