const functions = require('firebase-functions');
const util = require('util');
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
        functions.config().basepath.local :
        functions.config().basepath.production;
}

// Clean logging
exports.log = (message) => {
    if (!process.env.FIREBASE_CONFIG || process.env.FUNCTIONS_EMULATOR) {
        console.log(util.inspect(message, {showHidden: false, depth: null, colors: true}));
    } else {
        functions.logger.log(message, { structuredData: true });
    }
};

