const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const FieldValue = firestore.FieldValue;
const cors = require('cors')({ origin: true });
const helpers = require('../../libs/helpers');

/**
 * Rebalance portfolio tokens and debt
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

                // Get the data from the request
                let { 
                    portfolioId,
                    longToken,
                    shortToken,
                } = request.body;

                // Return an error if needed
                if (portfolioId === undefined || portfolioId === '')
                    throw new Error("A `portfolioId` must be set.");

                // Initialize Firebase components
                const db = firestore();

                // Get the doc for this portfolio
                const portfoliosRef = db.collection('portfolios');
                const portfolioRef = portfoliosRef.doc(portfolioId);
                const portfolioDoc = await portfolioRef.get();
                const signalsRef = portfolioRef.collection('signals');
                
                // Make sure we have a valid portfolio
                if (portfolioDoc.data() === undefined)
                    throw new Error("Unknown `portfolioId`");

                // And that it's active
                if (portfolioDoc.data().isActive === false)
                    throw new Error("Portfolio " + portfolioId + " is not active.");

                // Yay! We're authorized!
                const { poolContract } = portfolioDoc.data();
                    
                
                // Did we receive a new signal?
                if (longToken === undefined
                    || longToken === ''
                    || shortToken === undefined
                    || shortToken === '') {

                    // Get the last signal sent to this portfolio
                    const signalsSnapshot = await signalsRef.orderBy('createdAt', 'desc').limit(1).get();
                    const lastSignal = helpers.snapshotToArray(signalsSnapshot)[0].data;
                    longToken = lastSignal.long;
                    shortToken = lastSignal.short;                    
                    
                } else {
                    // Default stablecoin or stable fiat signals to USDC
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
                }
                
                helpers.log(longToken);
                helpers.log(shortToken);
                helpers.log(poolContract);

                // Check wallet balances with dhedge

                // Check AAVE balances with zapper

                // Check our last signal to see what we are long/short
                if (longToken === 'USDC' && shortToken === 'USDC') {
                    // WHILE ANY DEBT EXISTS
                        // Calculate max supply to withdrawl
                        // Withdrawl max supply
                        // UniswapV3 into Short token
                        // Repay AAVE debt
                        // Repeat
                    // Withdraw any remaining supply

                    // IF WE HAVE NON-USDC TOKENS
                        // UniswapV3 into USDC
                } else {
                    // WHILE ANY NON-short-TOKEN DEBT EXISTS
                        // Calculate max supply to withdrawl
                        // Withdrawl max supply
                        // UniswapV3 into Short token
                        // Repay AAVE debt
                        // Repeat
                    // Withdraw any remaining supply that isn't our Long token

                    // IF WE HAVE TOKENS IN OUR WALLET
                        // IF TOKENS ARE DIFFERENT FROM OUR LONG TOKEN
                            // UniswapV3 into Long tokens

                        // Lend Long tokens to AAVE

                    // WHILE TARGET LEVERAGE NOT YET REACHED (e.g. 1.75x)
                        // Calculate max debt to borrow
                        // Borrow max debt
                        // UniswapV3 into Long tokens
                        // Lend Long tokens to AAVE
                        // Repeat

                    // WHILE LIQUIDATION HEALTH ABOVE TARGET CEILING (e.g. 1.5)
                        // Calculate max debt to borrow
                        // Borrow max debt
                        // UniswapV3 into Long tokens
                        // Lend Long tokens to AAVE
                        // Repeat

                    // WHILE LIQUIDATION HEALTH BELOW TARGET FLOOR (e.g. 1.3)
                        // Calculate max supply to withdrawl
                        // Withdrawl max supply
                        // UniswapV3 into Short token
                        // Repay AAVE debt
                        // Repeat
                    
                }
                
                response.status(200).send({ message: 'Authorized!' });

                // Termininate the function
                return response.end();
            } catch (err) {
                functions.logger.error(err, { structuredData: true });
                return helpers.error(response, 400, err.message);
            }
        })
    });