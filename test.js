// const {supportedLanguages} = require("./constants");
// const {writeFile} = require("fs");
// const { GoogleGenAI } = require("@google/genai");
// const mime = require('mime-types');
//
//
// function saveBinaryFile(fileName, content) {
//     writeFile(fileName, content, 'utf8', (err) => {
//         if (err) {
//             console.error(`Error writing file ${fileName}:`, err);
//             return;
//         }
//         console.log(`File ${fileName} saved to file system.`);
//     });
// }
//
// async function main() {
//     const API_KEY = 'AIzaSyAtZ5ka2JDSFqJDoRct5C5loJ9QClYmw7w';
//
//     const ai = new GoogleGenAI({
//         apiKey: API_KEY,
//     });
//     const config = {
//         temperature: 1,
//         responseModalities: [
//             'audio',
//         ],
//         speechConfig: {
//             voiceConfig: {
//                 languageCode: 'uk-UA',
//                 prebuiltVoiceConfig: {
//                     voiceName: 'Leda',
//                 }
//             }
//         },
//     };
//     const model = 'gemini-2.5-flash-preview-tts';
//     const contents = [
//         {
//             role: 'user',
//             parts: [
//                 {
//                     text,
//                 },
//             ],
//         },
//     ];
//
//     const response = await ai.models.generateContentStream({
//         model,
//         config,
//         contents,
//     });
//     let fileIndex = 0;
//     for await (const chunk of response) {
//         if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
//             continue;
//         }
//         if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
//             const fileName = `ENTER_FILE_NAME_${fileIndex++}`;
//             const inlineData = chunk.candidates[0].content.parts[0].inlineData;
//             // let fileExtension = mime.getExtension(inlineData.mimeType || '');
//             let fileExtension = mime.extension(inlineData.mimeType || ''); // <--- ЗМІНА ТУТ
//
//             let buffer = Buffer.from(inlineData.data || '', 'base64');
//             if (!fileExtension) {
//                 fileExtension = 'wav';
//                 buffer = convertToWav(inlineData.data || '', inlineData.mimeType || '');
//             }
//
//             try {
//                 // Directly send the audio buffer to Telegram
//                 await bot.sendVoice(CHAT_ID, { source: buffer, filename: `audio.${fileExtension}` });
//                 console.log(`Audio sent to Telegram bot.`);
//             } catch (telegramError) {
//                 console.error(`Error sending audio to Telegram:`, telegramError);
//             }
//
//
//             saveBinaryFile(`${fileName}.${fileExtension}`, buffer);
//         }
//         else {
//             console.log(chunk.text);
//         }
//     }
// }
//
// // main();
//
// function convertToWav(rawData, mimeType) {
//     const options = parseMimeType(mimeType)
//     const wavHeader = createWavHeader(rawData.length, options);
//     const buffer = Buffer.from(rawData, 'base64');
//
//     return Buffer.concat([wavHeader, buffer]);
// }
//
// function parseMimeType(mimeType) {
//     const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
//     const [_, format] = fileType.split('/');
//
//     const options = {
//         numChannels: 1,
//     };
//
//     if (format && format.startsWith('L')) {
//         const bits = parseInt(format.slice(1), 10);
//         if (!isNaN(bits)) {
//             options.bitsPerSample = bits;
//         }
//     }
//
//     for (const param of params) {
//         const [key, value] = param.split('=').map(s => s.trim());
//         if (key === 'rate') {
//             options.sampleRate = parseInt(value, 10);
//         }
//     }
//
//     return options;
// }
//
// function createWavHeader(dataLength, options) {
//     const {
//         numChannels,
//         sampleRate,
//         bitsPerSample,
//     } = options;
//
//     // http://soundfile.sapp.org/doc/WaveFormat
//
//     const byteRate = sampleRate * numChannels * bitsPerSample / 8;
//     const blockAlign = numChannels * bitsPerSample / 8;
//     const buffer = Buffer.alloc(44);
//
//     buffer.write('RIFF', 0);                      // ChunkID
//     buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
//     buffer.write('WAVE', 8);                      // Format
//     buffer.write('fmt ', 12);                     // Subchunk1ID
//     buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
//     buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
//     buffer.writeUInt16LE(numChannels, 22);        // NumChannels
//     buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
//     buffer.writeUInt32LE(byteRate, 28);           // ByteRate
//     buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
//     buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
//     buffer.write('data', 36);                     // Subchunk2ID
//     buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size
//
//     return buffer;
// }
