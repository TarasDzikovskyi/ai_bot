const path = require('path')
const log4js = require('log4js');


const coloredLayout = {
    type: "pattern",
    pattern: "%d{yyyy-MM-dd hh:mm:ss.SSS} [%[%p%]] [%f{2}:%l] %m%n",
    tokens: {
        level: function (level) {
            switch (level) {
                case 'INFO': return '\x1b[32m' + level + '\x1b[0m';  // Зелений
                case 'ERROR': return '\x1b[31m' + level + '\x1b[0m'; // Червоний
                case 'WARN': return '\x1b[33m' + level + '\x1b[0m';  // Жовтий
                case 'DEBUG': return '\x1b[36m' + level + '\x1b[0m'; // Блакитний
                default: return level;
            }
        },
    },
};


log4js.configure({
    appenders: {
        out: {
            type: "stdout",
            layout: coloredLayout,
        },
        file: {
            type: "dateFile",
            filename: path.join(__dirname, '..', '/logs/app.log'),
            pattern: "yyyy-MM-dd", // Шаблон для імен файлів
            daysToKeep: 2,
            layout: {
                type: "pattern",
                pattern: "%d{yyyy-MM-dd hh:mm:ss} [%p] [%f{2}:%l] %m%n",
            },
            keepFileExt: true,
        },
    },
    categories: {
        default: {
            appenders: ["out", "file"],
            level: "trace",
            enableCallStack: true
        },
    },
});


module.exports.log4js = log4js;



