const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const FieldValue = firestore.FieldValue;
const cors = require('cors')({ origin: true });
const fetch = require('node-fetch');
const helpers = require('../../libs/helpers');

/**
 * Sets a signal for a portfolio
 */
exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process
        timeoutSeconds: 120,
        memory: "1GB",
        secrets: [
            "API_KEY", 
            "LOCAL_BASEPATH",
            "PRODUCTION_BASEPATH", 
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

                // Get the data from the request
                let { 
                    secret,
                    longToken,
                    shortToken,
                } = request.body;

                // Return an error if needed
                if (secret === undefined || secret === '')
                    throw new Error("A `secret` must be set.");

                // Return an error if needed
                if (longToken === undefined || longToken === '')
                    throw new Error("A `longToken` must be set.");

                // Return an error if needed
                if (shortToken === undefined || shortToken === '')
                    throw new Error("A `shortToken` must be set.");

                // Initialize Firebase components
                const db = firestore();

                // Get the doc for this portfolio
                const portfoliosRef = db.collection('portfolios');
                const portfolioRef = portfoliosRef.doc(secret);
                const portfolioDoc = await portfolioRef.get();
                const signalsRef = portfolioRef.collection('signals');
                
                // Make sure we have a valid portfolio
                if (portfolioDoc.data() === undefined)
                    throw new Error("Unknown `secret`");

                // And that it's active
                if (portfolioDoc.data().isActive === false)
                    throw new Error("This secret is no longer active.");

                // Yay! We're authorized!
                
                // Store stablecoin or stable fiat signals as USDC
                longToken  = longToken.toUpperCase();
                shortToken = shortToken.toUpperCase();
                if (longToken === 'USD' 
                    || longToken === 'DAI' 
                    || longToken === 'USDT') {
                        longToken = 'USDC';
                    }
                if (shortToken === 'USD' 
                    || shortToken === 'DAI' 
                    || shortToken === 'USDT') {
                        shortToken = 'USDC';
                    }

                // Save the new signal
                await signalsRef.doc().set({
                    long: longToken
                    , short: shortToken
                    , createdAt: FieldValue.serverTimestamp()
                });
                
                helpers.log(
                    portfolioDoc.data().fundName
                     + ' has been instructed to long ' + longToken
                     + ' and short ' + shortToken
                );

                if (helpers.getBasepath() === undefined || helpers.getBasepath() === '')
                    throw new Error("LOCAL_BASEPATH &/OR PRODUCTION_BASEPATH is not defined.");

                // Rebalance the pool and debt in a new thread
                // We're purposely not calling this with await
                // because we don't want this script to hang. 
                fetch(helpers.getBasepath()
                    + 'publicRebalanceOnRequest',
                    {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Accept-Encoding': 'deflate, gzip',
                            'authorization': process.env.API_KEY
                        },
                        body: JSON.stringify({ 'secret': secret })
                    }
                );
                
                response.status(200).send({ message: 'Signal saved!' });

                // Termininate the function
                return response.end();
            } catch (err) {
                functions.logger.error(err, { structuredData: true });
                return helpers.error(response, 400, err.message);
            }
        })
    });