const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const helpers = require('../../libs/helpers');

/**
 * Simple Hello World test
 */
exports = module.exports = functions
    .https
    .onRequest(async (request, response) => {
        cors(request, response, async () => {
            // Perform desired operations...
            helpers.log("Hello!");

            // Send a response
            response.status(200).send({ test: 'Testing functions' });

            // Terminate the function
            return response.end();
        })
    });