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
                longToken = lastSignal.data.long;
                shortToken = lastSignal.data.short;
                
                helpers.log('Last signal ID: ' + lastSignal.id);
                helpers.log('Long Token:     ' + longToken);
                helpers.log('Short Token:    ' + shortToken);
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
                if (longToken === 'USDC' && shortToken === 'USDC') {
                    
                    // If debt exist...
                    if (!_.isEmpty(tokens['aave']['variable-debt'])) {
                            helpers.log('This is where we would reduce all debt...');
                            tokens = await aave.reduceDebt(pool, tokens);
                    }

                    if (startingAaveBalances['supply'].length > 0) {
                            for (const token of newBalances['aave']['supply']) {
                                // Withdraw any remaining supply
                                helpers.log('This is where we withdrawl any remaining ' + token.symbol + ' supply...');
                                await dhedge.withdrawLentTokens(pool, token.address, token.balanceInt);
        
                                // Track updated token balances
                                newBalances['aave']['supply'] = await dhedge.updateTokenBalance(
                                    newBalances['aave']['supply'],
                                    token.address,
                                    -token.balanceInt,
                                    pool.network
                                );
                                newBalances['wallet'] = await dhedge.updateTokenBalance(
                                    newBalances['wallet'],
                                    token.address,
                                    token.balanceInt,
                                    pool.network
                                );
                            }
                    }

                    // Swap into USDC as needed
                    helpers.log('This is where we will swap any non USDC into USDC');
                    for (const token of newBalances['wallet']) {
                        if (token.symbol !== 'USDC'
                            && token.balanceInt !== null
                            && token.balanceInt > 0) {
                                // Swap non-USDC tokens to USDC
                                const usdcAddress = dhedge.symbolToAddress('USDC', pool.network);
                                helpers.log('This is where we swap $' + token.balanceUsd + ' worth of ' + token.symbol + ' into USDC');
                                await dhedge.tradeUniswap(
                                    pool, 
                                    token.address, 
                                    usdcAddress,
                                    token.balanceInt);

                                // Track updated token balances
                                newBalances['wallet'] = await dhedge.updateTokenBalance(
                                    newBalances['wallet'],
                                    token.address,
                                    -token.balanceInt,
                                    pool.network
                                );

                                /**
                                 * @TODO Check this math. Conversion may not be correct.
                                 */
                                const estimatedSwapInteger = dhedge.decimalToInteger(
                                    token.balanceDecimal, 
                                    token.decimals
                                );
                                newBalances['wallet'] = await dhedge.updateTokenBalance(
                                    newBalances['wallet'],
                                    usdcAddress,
                                    estimatedSwapInteger,
                                    pool.network
                                );
                        }
                    }

                    helpers.log('Now we should be holding only USDC and have AAVE cleared');
                    
                } else {
                    // If any non-short token debt exists
                    if (startingAaveBalances['variable-debt'].length > 0
                        && startingAaveBalances['variable-debt'][0].symbol !== shortToken) {
                            helpers.log('This is where we would reduce ' + startingAaveBalances['variable-debt'][0].symbol + ' debt...');
                            newBalances = await aave.reduceDebt(pool, startingAaveBalances, startingWalletBalances);
                            
                            for (const token of newBalances['aave']['supply']) {
                                if (token.symbol !== longToken) {
                                    // Withdraw any remaining supply that isn't our long token
                                    helpers.log('This is where we would withdrawl any remaining supply that isn\'t ' + longToken);
                                    // WITHDRAW SUPPLY TOKENS
                                    helpers.log('Withdrawing $' + token.balanceUsd + ' worth of ' + token.symbol + ' from AAVE');
                                    await dhedge.withdrawLentTokens(pool, token.address, token.balanceInt);

                                    // Track the changes to supply balances due to withdraw
                                    newBalances['wallet'] = await dhedge.updateTokenBalance(
                                        newBalances['wallet'],
                                        token.address,
                                        token.balanceInt,
                                        pool.network);
                                    newBalances['aave']['supply'] = await dhedge.updateTokenBalance(
                                        newBalances['aave']['supply'],
                                        token.address,
                                        -token.balanceInt,
                                        pool.network);
                                }
                            }
                    }

                    // Get the token details for the longToken
                    let longTokenDetails = {};
                    for (const token of newBalances['wallet']) {
                        if (token.symbol === longToken) {
                            longTokenDetails = token;
                        }
                    }

                    for (const token of newBalances['wallet']) {
                        // IF WE HAVE TOKENS IN OUR WALLET WITH A BALANCE
                        if (token.balanceUsd > 0) {
                            
                            // IF TOKENS ARE DIFFERENT FROM OUR LONG TOKEN
                            if (token.symbol !== longToken) {
                                // UniswapV3 into Long tokens
                                helpers.log(
                                    'Swap ' + token.balanceDecimal
                                    + ' ' + token.symbol
                                    + ' into ' + longToken
                                    + ' using Uniswap v3'
                                );
                                await dhedge.tradeUniswap(
                                    pool, 
                                    token.address, 
                                    dhedge.symbolToAddress(longToken, pool.network),
                                    token.balanceInt);

                                // Track updated token balances
                                newBalances['wallet'] = await dhedge.updateTokenBalance(
                                    newBalances['wallet'],
                                    token.address,
                                    -token.balanceInt,
                                    pool.network
                                );

                                let swapDecimals = (token.usdPrice > longTokenDetails.usdPrice) ? 
                                    token.balanceDecimal * token.usdPrice
                                     : token.balanceDecimal / longTokenDetails.usdPrice;
                                const estimatedSwapInteger = dhedge.decimalToInteger(
                                    swapDecimals, 
                                    longTokenDetails.decimals
                                );
                                newBalances['wallet'] = await dhedge.updateTokenBalance(
                                    newBalances['wallet'],
                                    dhedge.symbolToAddress(longToken, pool.network),
                                    estimatedSwapInteger,
                                    pool.network
                                );

                            }

                            for (const token of newBalances['wallet']) {
                                if (token.symbol === longToken) {
                                    // Lend Long tokens to AAVE
                                    helpers.log(
                                        'Lend $' + token.balanceUsd
                                        + ' worth of ' + longToken
                                        + ' to AAVE v2'
                                    );
                                    
                                    /**
                                     * @TODO figure out why lending fails after swapping
                                     */
                                    await dhedge.lendDeposit(pool, token.address, Math.round(token.balanceInt * 0.99));

                                    // Track updated token balances
                                    newBalances['wallet'] = await dhedge.updateTokenBalance(
                                        newBalances['wallet'],
                                        token.address,
                                        -token.balanceInt,
                                        pool.network
                                    );
                                    newBalances['aave']['supply'] = await dhedge.updateTokenBalance(
                                        newBalances['aave']['supply'],
                                        token.address,
                                        token.balanceInt,
                                        pool.network
                                    );
                                }
                            }
                            
                        }
                    }

                    // await aave.borrow(shortToken);
                    helpers.log('This is where we borrow ' + shortToken
                        + ' and swap into ' + longToken + ' until we reach target leverage');
                    // WHILE TARGET LEVERAGE NOT YET REACHED (e.g. 1.75x)
                        // Calculate max debt to borrow
                        // Borrow max debt
                        // UniswapV3 into Long tokens
                        // Lend Long tokens to AAVE
                        // Repeat

                    helpers.log('This is where, if needed, we borrow more ' + shortToken
                        + ' and swap into ' + longToken + ' until we reach our liquidaton health cieling');
                    // WHILE LIQUIDATION HEALTH ABOVE TARGET CEILING (e.g. 1.5)
                        // Calculate max debt to borrow
                        // Borrow max debt
                        // UniswapV3 into Long tokens
                        // Lend Long tokens to AAVE
                        // Repeat

                    helpers.log('This is where, if needed, we withdrawl ' + longToken
                        + ' and swap into ' + shortToken + ' and repay debt until we reach our liquidaton health floor');
                    newBalances = await aave.reduceDebt(
                        pool, 
                        newBalances['wallet'], 
                        newBalances['aave'],
                        aave.liquidationHealthTargetFloor
                    );
                    
                    helpers.log('Now our wallet is empty and AAVE has maxed leverage'
                        + ' with ' + longToken + ' supplied as collateral for ' + shortToken + ' debt');
                }

                helpers.log('Here\'s our new balances (estimated):');
                helpers.log(newBalances);
                
                response.status(200).send({ message: 'Rebalance complete!' });

                // Termininate the function
                return response.end();
            } catch (err) {
                functions.logger.error(err, { structuredData: true });
                return helpers.error(response, 400, err.message);
            }
        })
    });