const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const cors = require('cors')({ origin: true });
// const _ = require('lodash');
const helpers = require('../../libs/helpers');
const dhedge = require('../../libs/dhedge');

/**
 * Authenticated Hello World test
 */
exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process
        timeoutSeconds: 400,
        memory: "2GB",
        secrets: [
            "API_KEY", 
            "MNEMONIC", 
            "PROVIDER",
            "POOL_ADDRESS",
            "COIN_MARKET_CAP_API_KEY",
            "ZAPPER_API_KEY",
        ],
    })
    .https
    .onRequest(async (request, response) => {
        cors(request, response, async () => {
            try {
                // Force POST
                if (request.method !== "POST") return helpers.error(response, 400, 
                    "Request method must be POST.");
            
                // Handle Auth
                const { authorization }  = request.headers;
                if (!authorization) return helpers.error(response, 403, 
                    "Unauthorized. A key must be provided in the `authorization` header.");
                
                if (authorization !== process.env.API_KEY) return helpers.error(response, 403, 
                    "Unauthorized. The API key provided is invalid.");
                
                // Authorized!

                // Get the data from the request
                const { secret } = request.body;

                // Return an error if needed
                if (secret === undefined || secret === '')
                    throw new Error("A `secret` must be set.");

                // Initialize Firebase components
                const db = firestore();

                // Get the doc for this portfolio
                const portfoliosRef = db.collection('portfolios');
                const portfolioRef = portfoliosRef.doc(secret);
                const portfolioDoc = await portfolioRef.get();

                // Get the transactions collection for logging
                const txsRef = portfolioRef.collection('transactions');

                // Make sure we have a valid portfolio
                if (portfolioDoc.data() === undefined)
                    throw new Error("Unknown `secret`");

                // And that it's active
                if (portfolioDoc.data().isActive === false)
                    throw new Error("This secret is not active.");

                // Yay! We're authorized!
                const { poolContract, network } = portfolioDoc.data();

                // SETUP A POOL
                const pool = await dhedge.initPool(
                    process.env.MNEMONIC,
                    poolContract,
                    network
                );

                // Check wallet balances with dhedge
                let tokens = await dhedge.getBalances(pool);
                helpers.log(tokens);

                // Perform a trade
                dhedge.lendDeposit(
                    pool, 
                    txsRef, 
                    tokens, 
                    tokens['wallet']['USDC'], 
                    tokens['wallet']['USDC'].balanceInt
                );

                // Respond
                response.status(200).send({ message: 'Success'});

                // Termininate the function
                return response.end();
            } catch (err) {
                functions.logger.error(err, { structuredData: true });
                return helpers.error(response, 400, err.message);
            }
        })
    });