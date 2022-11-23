const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const util = require('util');
const delay = require('delay');
const _this = this;

/**
 * Return Clean Error Response
 * 
 * @param {Object} response Express response object
 * @param {Number} statusCode The status code to return
 * @param {String} message The error message
 */
 exports.error = (response, statusCode, message) => {
    response.status(statusCode).send({
        "timestamp": Date.now(),
        "status": statusCode,
        "error": message
    });
    response.end();
}

/**
 * Stop Watch Helper
 * 
 * @param {Object} hrtimeStop hrtime object
 * @returns Amount of time in seconds
 */
exports.stopWatch = (hrtimeStop) => {
    return (hrtimeStop[0] * 1e9 + hrtimeStop[1])/1e9;
}

/**
 * Get the basepath for fetching other functions.
 * 
 * @returns {String} A basepath such as `http://localhost:5001/[project-id]/us-central1/`
 */
 exports.getBasepath = () => {
    return (process.env.FUNCTIONS_EMULATOR) ?
        process.env.LOCAL_BASEPATH :
        process.env.PRODUCTION_BASEPATH;
}

// Clean logging
exports.log = (message) => {
    if (!process.env.FIREBASE_CONFIG || process.env.FUNCTIONS_EMULATOR) {
        console.log(util.inspect(message, {showHidden: false, depth: null, colors: true}));
    } else {
        functions.logger.log(message, { structuredData: true });
    }
};

/**
 * Delay 
 * 
 * @param {Number} time Number of seconds to pause script processing
 */
exports.delay = async (seconds = 2) => {
    _this.log('   ...Pausing for ' + seconds + ' seconds...');
    await delay(seconds * 1000);
}

// Gets a snapshot from Firestore as an Array
exports.snapshotToArray = (snapshot) => {
    try {
        let returnArr = [];
        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                returnArr.push({
                    id: doc.id,
                    data: doc.data()
                });
            });
        }
        return returnArr;
    } catch (error) {
        functions.logger.error(error);
        return null;
    }
}

exports.getFirestoreUtcTimestamp = () => {
    // Calculate the timestamp
    const now = new Date();
    const utcMilllisecondsSinceEpoch = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const utcSecondsSinceEpoch = Math.round(utcMilllisecondsSinceEpoch / 1000);
    const timestamp = new firestore.Timestamp(utcSecondsSinceEpoch, 0);
    return timestamp;
}

exports.countDecimals = (value) => {
    if (!isFinite(value) || value === null) return 0;
        
    const text = value.toString()
    // verify if number 0.000005 is represented as "5e-6"
    if (text.indexOf('e-') > -1) {
      const [base, trail] = text.split('e-');
      const deg = parseInt(trail, 10);
      return deg;
    }
    // count decimals for number in representation like "0.123456"
    if (Math.floor(value) !== value) {
        return (text.split(".")[1] === undefined) ? 0 : text.split(".")[1].length
    }
    
    return 0;
};

exports.numberToSafeString = (value) => {
    if (!isFinite(value) || value === null) return '0';

    const text = value.toString()
    
    if (text.indexOf('e-') > -1) {
        // verify if number 0.000005 is represented as "5e-6"
        const [base, trail] = text.split('e-');
        const [before, after] = base.split(".");
        
        let amount = '0.';
        for (let i = 0; i < trail - 1; i++) {
            amount += '0';
        }
        amount += (after === undefined) ? before : before + after;
        return amount;

    } else if (text.indexOf('e+') > -1) {
        // verify if number 5000000 is represented as "5e+6"
        const [base, trail] = text.split('e+');
        const [before, after] = base.split(".");
        let amount = before; 
        let counter = trail;

        if (after !== undefined) {
            amount += after;
            counter -= after.length;
        }

        for (let i = 0; i < counter; i++) {
            amount += '0';
        }
        return amount;
    }
    
    return text;
};