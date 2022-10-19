const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const cors = require('cors')({ origin: true });
const _ = require('lodash');
const helpers = require('../../libs/helpers');
const dhedge = require('../../libs/dhedge');
const aave = require('../../libs/aave');

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
            "PROVIDER",
            "COIN_MARKET_CAP_API_KEY",
            "ZAPPER_API_KEY",
            "MNEMONIC", 
        ],
    })
    .https
    .onRequest(async (request, response) => {
        cors(request, response, async () => {
            try {
                // Make sure our ENVs are set
                if (process.env.API_KEY === undefined || process.env.API_KEY === '')
                    throw new Error("API_KEY is not defined on the server.");
                if (process.env.PROVIDER === undefined || process.env.PROVIDER === '')
                    throw new Error("PROVIDER is not defined on the server.");
                if (process.env.COIN_MARKET_CAP_API_KEY === undefined || process.env.COIN_MARKET_CAP_API_KEY === '')
                    throw new Error("COIN_MARKET_CAP_API_KEY is not defined on the server.");
                if (process.env.ZAPPER_API_KEY === undefined || process.env.ZAPPER_API_KEY === '')
                    throw new Error("ZAPPER_API_KEY is not defined on the server.");

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
                const signalsRef = portfolioRef.collection('signals');
                
                // Make sure we have a valid portfolio
                if (portfolioDoc.data() === undefined)
                    throw new Error("Unknown `secret`");

                // And that it's active
                if (portfolioDoc.data().isActive === false)
                    throw new Error("This secret is no longer active.");

                // Yay! We're authorized!
                const { poolContract, network } = portfolioDoc.data();
                
                // Get the last signal sent to this portfolio
                const signalsSnapshot = await signalsRef.orderBy('createdAt', 'desc').limit(1).get();
                const lastSignal = helpers.snapshotToArray(signalsSnapshot)[0];
                const longSymbol = lastSignal.data.long;
                const shortSymbol = lastSignal.data.short;
                
                helpers.log('Last signal ID: ' + lastSignal.id);
                helpers.log('Long Token:     ' + longSymbol);
                helpers.log('Short Token:    ' + shortSymbol);
                helpers.log('Pool Contract:  ' + poolContract);

                // Check wallet balances with dhedge
                // @TODO replace mnemonic env with decrypted value from db
                const pool = await dhedge.initPool(
                    process.env.MNEMONIC,
                    poolContract, 
                    network
                );
                let tokens = await dhedge.getBalances(pool);
                helpers.log(tokens);

                // Check our last signal to see what we are long/short
                if (longSymbol === 'USDC' && shortSymbol === 'USDC') {
                    // REDUCE DEBT
                    tokens = await aave.reduceDebt(pool, tokens);

                    // WITHDRAW SUPPLY
                    for (const supplyTokenSymbol in tokens['aave']['supply']) {
                        const supplyToken = tokens['aave']['supply'][supplyTokenSymbol];
                        helpers.log('Withdrawing $' + supplyToken.balanceUsd + ' worth of ' + supplyTokenSymbol + ' from AAVE supply');
                        tokens = await dhedge.withdrawLentTokens(pool, tokens, supplyToken.address, supplyToken.balanceInt);
                    }

                    // SWAP TO USDC
                    for (const tokenSymbol in tokens['wallet']) {
                        if (tokenSymbol !== 'USDC') {
                            const token = tokens['wallet'][tokenSymbol];
                            helpers.log('Swapping ~$' + token.balanceUsd + ' worth of ' + tokenSymbol + ' into USDC on Uniswap');
                            tokens = await dhedge.tradeUniswap(pool, tokens, token.address, dhedge.symbolToAddress('USDC', pool.network), token.balanceInt);
                        }
                    }

                    helpers.log('Now we should be holding only USDC and have AAVE cleared');
                    
                } else {
                    // If any non-short token debt exists

                    const debtSymbol = _.keys(tokens['aave']['variable-debt'])[0];
                    if (debtSymbol !== shortSymbol) {
                        // REDUCE DEBT !== SHORT SYMBOL
                        tokens = await aave.reduceDebt(pool, tokens);

                        // WITHDRAW SUPPLY !== LONG SYMBOL
                        for (const supplyTokenSymbol in tokens['aave']['supply']) {
                            if (supplyTokenSymbol !== longSymbol) {
                                const supplyToken = tokens['aave']['supply'][supplyTokenSymbol];
                                helpers.log('Withdrawing $' + supplyToken.balanceUsd + ' worth of ' + supplyTokenSymbol + ' from AAVE supply');
                                tokens = await dhedge.withdrawLentTokens(pool, tokens, supplyToken.address, supplyToken.balanceInt);
                            }
                        }
                    }
                    
                    for (const tokenSymbol in tokens['wallet']) {
                        if (tokenSymbol !== longSymbol) {
                            // SWAP WALLET ASSETS TO LONG TOKEN
                            const token = tokens['wallet'][tokenSymbol];
                            helpers.log('Swapping ~$' + token.balanceUsd + ' worth of ' + tokenSymbol + ' into ' + longSymbol + ' on Uniswap');
                            tokens = await dhedge.tradeUniswap(pool, tokens, token.address, dhedge.symbolToAddress(longSymbol, pool.network), token.balanceInt);
                        }
                    }

                    if (tokens['wallet'][longSymbol] !== undefined) {
                        // LEND LONG TOKEN TO AAVE
                        const token = tokens['wallet'][longSymbol];
                        helpers.log('Lending ~$' + token.balanceUsd + ' worth of ' + longSymbol + ' to AAVE supply');
                        tokens = await dhedge.lendDeposit(pool, tokens, token.address, token.balanceInt);
                    }
                    
                    // await aave.borrow(shortToken);
                    helpers.log('This is where we borrow ' + shortSymbol
                        + ' and swap into ' + longSymbol + ' until we reach target leverage');
                    // WHILE TARGET LEVERAGE NOT YET REACHED (e.g. 1.75x)
                        // Calculate max debt to borrow
                        // Borrow max debt
                        // UniswapV3 into Long tokens
                        // Lend Long tokens to AAVE
                        // Repeat

                    helpers.log('This is where, if needed, we borrow more ' + shortSymbol
                        + ' and swap into ' + longSymbol + ' until we reach our liquidaton health cieling');
                    // WHILE LIQUIDATION HEALTH ABOVE TARGET CEILING (e.g. 1.5)
                        // Calculate max debt to borrow
                        // Borrow max debt
                        // UniswapV3 into Long tokens
                        // Lend Long tokens to AAVE
                        // Repeat

                    helpers.log('This is where, if needed, we withdrawl ' + longSymbol
                        + ' and swap into ' + shortSymbol + ' and repay debt until we reach our liquidaton health floor');
                    tokens = await aave.reduceDebt(pool, tokens, aave.liquidationHealthTargetFloor);

                    helpers.log('Now our wallet is empty and AAVE has maxed leverage'
                        + ' with ' + longSymbol + ' supplied as collateral for ' + shortSymbol + ' debt');
                }

                helpers.log(tokens);
                
                response.status(200).send({ message: 'Rebalance complete!' });

                // Termininate the function
                return response.end();
            } catch (err) {
                functions.logger.error(err, { structuredData: true });
                return helpers.error(response, 400, err.message);
            }
        })
    });