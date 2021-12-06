const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });

/**
 * Simple Hello World test
 */
exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process
        timeoutSeconds: 120,
        memory: "1GB",
    })
    .https
    .onRequest(async (request, response) => {
        cors(request, response, async () => {
        // Perform desired operations...
        functions.logger.info("Hello!", { structuredData: true });

        // Send a response
        response.status(200).send({ test: 'Testing functions' });

        // Terminate the function
        response.end();
        })
    });