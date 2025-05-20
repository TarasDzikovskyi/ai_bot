const {CronJob} = require('cron');
const path = require("node:path");
const fs = require("node:fs/promises");


const cron_job = CronJob.from({
    cronTime: '0 0 */1 * * *', // перевірка кожної години
    onTick: async () => {
        await checkedOldAudio();
    },
    start: true,
    timeZone: 'Europe/Kyiv',
});



const checkedOldAudio = async () => {
    try {
        const dirPath = path.join(__dirname, '..', 'audio');
        // console.log(dirPath)
        const files = await fs.readdir(dirPath);

        const now = Date.now();
        const hours12 = 6 * 60 * 60 * 1000; // 6 годин у мілісекундах

        let deletedCount = 0;

        for (const file of files) {
            const match = file.match(/^(audio|correction)_(\d+)\.oga$/);

            if (match) {
                const timestamp = Number(match[2]);

                if (!isNaN(timestamp) && now - timestamp > hours12) {
                    const filePath = path.join(dirPath, file);
                    // console.log(filePath)
                    await fs.unlink(filePath);
                    console.log(`✅ Видалено старий файл: ${file}`);
                    deletedCount++;
                }
            }
        }

        console.log(`🗑️  Видалено: ${deletedCount}`);
    } catch (e) {
        console.error('❌ Помилка під час перевірки старих аудіо:', e);
    }
};


module.exports.cron_job = cron_job;