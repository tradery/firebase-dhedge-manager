const { Dhedge, Dapp, Network, ethers, Pool } = require("@dhedge/v2-sdk");
const helpers = require('./helpers');
const coinmarketcap = require('./coinmarketcap');
const zapper = require("./zapper");
const _this = this;

exports.tokens = {
    polygon: {
        USDC: {
            address:  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            decimals: 6,
            coinMarketCapId: 3408,
            aaveLiquidationThreshold: 0.85,
        },
        WBTC: {
            address:  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
            decimals: 8,
            coinMarketCapId: 1,
            aaveLiquidationThreshold: 0.75,
        },
        WETH: {
            address:  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
            decimals: 18,
            coinMarketCapId: 1027,
            aaveLiquidationThreshold: 0.825,
        },
        WMATIC: {
            address:  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
            decimals: 18,
            coinMarketCapId: 3890,
            aaveLiquidationThreshold: 0.70,
        },
        LINK: {
            address:  '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
            decimals: 18,
            coinMarketCapId: 1975,
            aaveLiquidationThreshold: 0.65,
        },
        // CRV: {
        //     address:  '0x172370d5cd63279efa6d502dab29171933a610af',
        //     decimals: 18,
        //     coinMarketCapId: 6538,
        //     aaveLiquidationThreshold: 0,
        // },
        // AAVE: {
        //     address:  '0xd6df932a45c0f255f85145f286ea0b292b21c90b',
        //     decimals: 18,
        //     coinMarketCapId: 7278,
        //     aaveLiquidationThreshold: 0,
        // },
        // UNI: {
        //     address:  '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
        //     decimals: 18,
        //     coinMarketCapId: 7083,
        //     aaveLiquidationThreshold: 0,
        // },
        // GRT: {
        //     address:  '0x5fe2b58c013d7601147dcdd68c143a77499f5531',
        //     decimals: 18,
        //     coinMarketCapId: 6719,
        //     aaveLiquidationThreshold: 0,
        // },
        AAVEV2: {
            address:  '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
            decimals: null,
            coinMarketCapId: null,
            aaveLiquidationThreshold: null,
        },
    }
};

exports.gasInfo = {
    gasPrice: ethers.utils.parseUnits('500', 'gwei'),
    gasLimit: 10000000
};

exports.swapSlippageTolerance = 2;

/**
 * Initial dHedge Pool
 * 
 * @param {String} mnemonic The mnemonic for the pool trader's wallet.
 * @param {String} poolAddress The address of a dhedge pool contract.
 * @param {String} network The blockchain network for this pool contract.
 * @returns {Promise<Pool>} a dhedge pool.
 */
exports.initPool = async (mnemonic, poolAddress, network = Network.POLYGON) => {
    // Initialize our wallet
    const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER);
    const wallet = new ethers.Wallet.fromMnemonic(mnemonic);
    const walletWithProvider = wallet.connect(provider);
    
    // Initialize dHedge v2 API
    const dhedge = new Dhedge(walletWithProvider, network);
    return await dhedge.loadPool(poolAddress);
}

/**
 * Get Pool & AAVE Balances
 * 
 * @param {Pool} pool a dHedge Pool object
 * @returns {Promise<Object>} A list of tokens with info and balances
 */
exports.getBalances = async (pool) => {
    const composition = await pool.getComposition();

    let assets = {
        'wallet': {},
        'aave': {
            'supply': {},
            'variable-debt': {},
        },
    };

    // GET WALLET BALANCES FROM THE POOL
    for (const asset of composition) {
        const token = await _this.createNewToken(asset.asset, asset.balance, pool.network);
        
        // Ignore tokens like AAVEV2, or zero balance assets
        if (token.decimals !== null && token.balanceInt !== 0) {
            assets['wallet'][token.symbol] = token;
        }
    }

    // GET AAVE BALANCES FROM ZAPPER
    assets['aave'] = zapper.cleanAaveBalances(await zapper.aaveBalances(pool.address));
    
    return assets;
}

/**
 * Create New Token
 * 
 * @param {String} address A token address that maps to this.tokens
 * @param {Number} balance A balance amount in a format compatible with ethers.BigNumber
 * @param {String} network A blockchain network that we're mapping tokens to
 * @returns {Promise<Object>} A token object with lots of details
 */
exports.createNewToken = async (address, balance = 0, network = 'polygon') => {
    const tokenDetails = await _this.addressToTokenDetails(address, network);
    const tokenBalance = _this.getBalanceInfo(
        balance, 
        tokenDetails.decimals,
        tokenDetails.usdPrice
    );
    return Object.assign({}, tokenDetails, tokenBalance);
}

/**
 * Token Address to Token Details
 * 
 * @param {String} address a token contract address
 * @param {String} network a blockchain network
 * @returns {Promise<Object>} a list of useful information about a token
 */
exports.addressToTokenDetails = async (address, network = 'polygon') => {
    const tokens = _this.tokens[network];
    for (const tokenSymbol in tokens) {
        const token = tokens[tokenSymbol];
        if (token.address.toLowerCase() === address.toLowerCase()) {
            // Get usd price from coin market cap
            const usdPrice = await coinmarketcap.getUsdPrice(token.coinMarketCapId);

            // Transform into object
            return {
                symbol: tokenSymbol,
                address: address.toLowerCase(),
                decimals: token.decimals,
                usdPrice: usdPrice,
                liquidationThreshold: token.aaveLiquidationThreshold,
                coinMarketCapId: token.coinMarketCapId
            };
        }
    }
    throw new Error('Token address (' + address + ') not found for ' + network);
}

/**
 * Get Balance Info for a Token
 * 
 * @param {Number} amount Amount before conversion to ethers.BigNumber format
 * @param {Integer} decimals Number of decimal places to consider
 * @param {Float} tokenPriceUsd The USD price of a token to convert the big number
 * @returns {Object} A list of balances in different formats
 */
exports.getBalanceInfo = (amount, decimals, tokenPriceUsd = null) => {
    const amountBn = ethers.BigNumber.from(amount.toString());
    const balanceDecimal = parseFloat(ethers.utils.formatUnits(amountBn, decimals));
    const balanceInt = _this.decimalToInteger(balanceDecimal, decimals);
    const balanceUsd = (tokenPriceUsd === null) ? null : tokenPriceUsd * balanceDecimal;
    return {
        balanceBn: amountBn,
        balanceDecimal: balanceDecimal,
        balanceInt: balanceInt,
        balanceUsd: balanceUsd
    }
}

/**
 * Decimal to Integer
 * 
 * @param {Float} amount Some decimal amount
 * @param {Integer} decimals Number of decimal places
 * @returns {Integer} The value without decimals
 */
exports.decimalToInteger = (amount, decimals) => {
    const response = Math.round(amount*('1e' + decimals));
    return isFinite(response) ? response : null;
}

/**
 * Slippage Multiplier
 * 
 * @param {Float} slippagePadding The percentage of acceptable slippage
 * @returns {Float} A multiplier for calculating amounts after expected slippage
 */
exports.slippageMultiplier = (slippagePadding = _this.swapSlippageTolerance) => {
    return (100 - slippagePadding) / 100;
}

/**
 * Update Balances
 * 
 * @param {Object} tokens An object with wallet and aave tokens
 * @param {String} instruction lend, borrow, repay, withdraw, swap
 * @param {Integer} changeInAmount The amount to change the tokens by. Must be ethers.BigNumber friendly
 * @param {String} addressFrom A token address, the main subject of the instruction
 * @param {String} addressTo A token address, the other actor in the instruction, if needed. Defaults to `null`.
 * @param {String} network A blockchain network to map token addresses to. Defaults to `'polygon'`
 * @param {Float} slippagePadding The amount of slippage we should assume for swaps, as a percentage, Defaults to `1.0`
 * @returns {Promise<Object>} An object with wallet and aave tokens that have updated balances
 */
exports.updateBalances = async (
    tokens, 
    instruction, 
    changeInAmount, 
    addressFrom, 
    addressTo = null, 
    network = 'polygon', 
    slippagePadding = _this.swapSlippageTolerance) => {
        const symbolFrom = _this.addressToSymbol(addressFrom);
        const symbolTo   = (addressTo !== null) ? _this.addressToSymbol(addressTo) : symbolFrom;
        const expectedSlippage = _this.slippageMultiplier(slippagePadding);
        let newUsdBalance = newBalanceDecimal = changeInAmountTo = 0;

        switch(instruction) {
            case 'lend':
                // Make sure we have tokens in the wallet
                if (tokens['wallet'][symbolFrom] === undefined) {
                    throw new Error('Cannot lend ' + symbolFrom + ' tokens because they do not exist in wallet.');
                }

                // Subtract the lent amount from our wallet
                tokens['wallet'][symbolFrom] = _this.updateTokenBalance(
                    tokens['wallet'][symbolFrom],
                    -changeInAmount
                );

                // Set a token object in the aave supply if not already set
                if (tokens['aave']['supply'][symbolTo] === undefined) {
                    tokens['aave']['supply'][symbolTo] = await _this.createNewToken(addressFrom, 0, network);
                }

                // Add the lent amount to the aave supply
                tokens['aave']['supply'][symbolTo] = _this.updateTokenBalance(
                    tokens['aave']['supply'][symbolTo],
                    changeInAmount,
                );
                break;
            case 'borrow':
                // Set a token object in our wallet if not already set
                if (tokens['wallet'][symbolFrom] === undefined) {
                    tokens['wallet'][symbolFrom] = await _this.createNewToken(addressFrom, 0, network);
                }
                
                // Set a token object in the aave debt if not already set
                if (tokens['aave']['variable-debt'][symbolTo] === undefined) {
                    tokens['aave']['variable-debt'][symbolTo] = await _this.createNewToken(addressFrom, 0, network);
                }

                // Add the borrowed amount to our wallet
                tokens['wallet'][symbolFrom] = _this.updateTokenBalance(
                    tokens['wallet'][symbolFrom],
                    changeInAmount
                );

                // Add the borrowed amount to the aave debt
                tokens['aave']['variable-debt'][symbolTo] = _this.updateTokenBalance(
                    tokens['aave']['variable-debt'][symbolTo],
                    changeInAmount
                );
                break;
            case 'repay':
                // Make sure we have tokens in the wallet and debt
                if (tokens['wallet'][symbolFrom] === undefined) {
                    throw new Error('Cannot repay ' + symbolFrom + ' tokens because they do not exist in wallet.');
                }
                if (tokens['aave']['variable-debt'][symbolTo] === undefined) {
                    throw new Error('Cannot repay ' + symbolTo + ' tokens because we do not have that kind of debt.');
                }

                // Subtract the repaid amount from our wallet
                tokens['wallet'][symbolFrom] = _this.updateTokenBalance(
                    tokens['wallet'][symbolFrom],
                    -changeInAmount
                );

                // Subtract the repaid amount from our aave debt
                tokens['aave']['variable-debt'][symbolTo] = _this.updateTokenBalance(
                    tokens['aave']['variable-debt'][symbolTo],
                    -changeInAmount
                );
                break;
            case 'withdraw':
                // Make sure we have tokens in the supply
                if (tokens['aave']['supply'][symbolFrom] === undefined) {
                    throw new Error('Cannot withdraw ' + symbolFrom + ' tokens that do not exist in AAVE supply.');
                }

                // Subtrack the withdrawed amount from the aave supply
                tokens['aave']['supply'][symbolFrom] = _this.updateTokenBalance(
                    tokens['aave']['supply'][symbolFrom],
                    -changeInAmount
                );

                // Set a token object in our wallet if not already set
                if (tokens['wallet'][symbolTo] === undefined) {
                    tokens['wallet'][symbolTo] = await _this.createNewToken(addressFrom, 0, network);
                }

                // Add the withdrawed amount to our wallet
                tokens['wallet'][symbolTo] = _this.updateTokenBalance(
                    tokens['wallet'][symbolTo],
                    changeInAmount
                );
                
                break;
            case 'swap':
                // Make sure we have tokens in the wallet
                if (tokens['wallet'][symbolFrom] === undefined) {
                    throw new Error('Cannot swap from ' + symbolFrom + ' tokens because they do not exist in wallet.');
                }

                // Set a token object in our wallet if not already set
                if (tokens['wallet'][symbolTo] === undefined) {
                    if (addressTo === null) {
                        throw new Error('A TO address must be set so we know what we\'re swapping into');
                    }
                    tokens['wallet'][symbolTo] = await _this.createNewToken(addressTo, 0, network);
                }

                // Calculate the amount of tokens we expect to have in the TO token
                newUsdBalance = expectedSlippage * tokens['wallet'][symbolFrom].balanceUsd;
                newBalanceDecimal = newUsdBalance / tokens['wallet'][symbolTo].usdPrice;
                changeInAmountTo = _this.decimalToInteger(newBalanceDecimal, tokens['wallet'][symbolTo].decimals);

                // Add the swapped amount to our wallet
                tokens['wallet'][symbolTo] = _this.updateTokenBalance(
                    tokens['wallet'][symbolTo],
                    changeInAmountTo
                );

                // Subtract the swapped amount from our wallet
                tokens['wallet'][symbolFrom] = _this.updateTokenBalance(
                    tokens['wallet'][symbolFrom],
                    -changeInAmount
                );
                break;
            default:
                return tokens;
        }

        // RECALCULATE SUPPLY & DEBT BALANCES, LIQUIDATION THRESHOLD AND HEALTH
        let supplyBalanceUsd = debtBalanceUsd = supplyLiquidationThreshold = 0;
        for (const tokenSymbol in tokens['aave']['supply']) {
            const token = tokens['aave']['supply'][tokenSymbol];
            supplyBalanceUsd += token.balanceUsd;
        }
        for (const tokenSymbol in tokens['aave']['variable-debt']) {
            const token = tokens['aave']['variable-debt'][tokenSymbol];
            debtBalanceUsd += token.balanceUsd;
        }
        for (const tokenSymbol in tokens['aave']['supply']) {
            const token = tokens['aave']['supply'][tokenSymbol];
            supplyLiquidationThreshold += (token.balanceUsd / supplyBalanceUsd) * token.liquidationThreshold;
        }
        tokens['aave']['liquidationThreshold'] = (isFinite(supplyLiquidationThreshold)) ? supplyLiquidationThreshold : 0;
        tokens['aave']['supplyBalanceUsd'] = supplyBalanceUsd;
        tokens['aave']['debtBalanceUsd'] = debtBalanceUsd;

        const leverage = supplyBalanceUsd / (supplyBalanceUsd - debtBalanceUsd);
        tokens['aave']['leverage'] = (isFinite(leverage)) ? leverage : 0;
        
        // And the liquidation health
        const liquidationHealth = supplyLiquidationThreshold / (debtBalanceUsd / supplyBalanceUsd);
        tokens['aave']['liquidationHealth'] = (isFinite(liquidationHealth)) ? liquidationHealth : null;

        // REMOVE ANY OBJECTS WITH A ZERO BALANCE
        for (const tokenSymbol in tokens['wallet']) {
            if (tokens['wallet'][tokenSymbol].balanceInt <= 0) {
                delete tokens['wallet'][tokenSymbol];
            }
        }
        for (const tokenSymbol in tokens['aave']['variable-debt']) {
            if (tokens['aave']['variable-debt'][tokenSymbol].balanceInt <= 0) {
                delete tokens['aave']['variable-debt'][tokenSymbol];
            }
        }
        for (const tokenSymbol in tokens['aave']['supply']) {
            if (tokens['aave']['supply'][tokenSymbol].balanceInt <= 0) {
                delete tokens['aave']['supply'][tokenSymbol];
            }
        }

        return tokens;
}

/**
 * Address to Token Symbol
 * 
 * @param {String} address a token contract address
 * @param {String} network a blockchain network. Defaults to `'polygon'`.
 * @returns {String} a token symbol
 */
exports.addressToSymbol = (address, network = 'polygon') => {
    const tokens = _this.tokens[network];
    for (const token in tokens) {
        if (tokens[token].address.toLowerCase() === address.toLowerCase()) {
            return token;
        }
    }
    throw new Error('Token address (' + address + ') not found for ' + network);
}

/**
 * Token Symbol to Address
 * 
 * @param {String} address a token symbol
 * @param {String} network a blockchain network. Defaults to `'polygon'`.
 * @returns {String} a token contract address
 */
exports.symbolToAddress = (symbol, network = 'polygon') => {
    const tokens = _this.tokens[network];
    for (const token in tokens) {
        if (token.toUpperCase() === symbol.toUpperCase()) {
            return tokens[token].address;
        }
    }
    return null;
}

/**
 * Update Token Balance
 * 
 * @param {Object} token A token object with lots of info
 * @param {Number} integerChange The amount to change the token balance
 * @returns {Object} The token object with updated balance info
 */
exports.updateTokenBalance = (token, integerChange) => {
    // Consider an edge condition, such as overpaying a debt balance
    const newAmount = ((token.balanceInt + integerChange) > 0) ? token.balanceInt + integerChange : 0;
    const newBalances = _this.getBalanceInfo(newAmount, token.decimals, token.usdPrice);
    return Object.assign({}, token, newBalances);
}

/**
 * Trade on Uniswap
 * 
 * @param {Pool} pool A dHedge pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens An object with wallet and aave token balances
 * @param {String} addressFrom The token contract address we're swapping from
 * @param {String} addressTo The token contract address we're swapping to
 * @param {Number} amountOfFromToken Amount of fromToken to swap, in format compatible with ethers.BigNumber
 * @param {Float} slippageTolerance Percentage of slippage to accept in trades. Defaults to `0.5`.
 * @param {Number} feeTier 100, 500, 3000, , or 10000. Defaults to `500`.
 * @returns {Promise<Object>} An object with updated wallet and aave token balances
 */
exports.tradeUniswap = async (
        pool,
        txsRef,
        tokens,
        addressFrom, 
        addressTo, 
        amountOfFromToken, 
        slippageTolerance = _this.swapSlippageTolerance,
        feeTier = 500
    ) => {
        helpers.log('SWAP WITH UNISWAP V3');
        const method = 'swap';
        const dapp = Dapp.UNISWAPV3;
        await helpers.delay(4);

        if (await _this.isRepeatedlyFailedTransaction(txsRef, method, addressFrom, amountOfFromToken, dapp) === true) {
            helpers.log('WE DID NOT TRY THIS TRANSACTION BECAUSE IT PROBABLY WOULD HAVE FAILED.');
            return tokens;

            /**
             * @TODO Consider putting slippage tollerance in the transaction log and adding that to the
             * failed transaction check. The incrementing it by 20% everytime until the transaction passes.
             */
        }
            
        const tx = await pool.tradeUniswapV3(
            addressFrom,
            addressTo,
            helpers.numberToSafeString(amountOfFromToken),
            feeTier,
            slippageTolerance,
            _this.gasInfo
        );
        // helpers.log(tx);
        await _this.logTransaction(txsRef, tx, dapp, method, pool.network, addressFrom, tokens, amountOfFromToken, addressTo);

        return await _this.updateBalances(
            tokens, 
            method, 
            amountOfFromToken, 
            addressFrom, 
            addressTo, 
            pool.network, 
            slippageTolerance * 1.5
        );
}

/**
 * Trade (not Uniswap)
 * 
 * @param {Pool} pool A dHedge pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens An object with wallet and aave token balances
 * @param {String} addressFrom The token contract address we're swapping from
 * @param {String} addressTo The token contract address we're swapping to
 * @param {Number} amountOfFromToken Amount of fromToken to swap, in format compatible with ethers.BigNumber
 * @param {Float} slippageTolerance Percentage of slippage to accept in trades. Defaults to `0.5`.
 * @param {String} dapp `SUSHISWAP` or `TOROS`.
 * @returns {Promise<Object>} An object with updated wallet and aave token balances
 */
 exports.trade = async (
    pool,
    txsRef,
    tokens,
    addressFrom, 
    addressTo, 
    amountOfFromToken, 
    slippageTolerance = _this.swapSlippageTolerance,
    dapp = 'SUSHISWAP'
) => {
    helpers.log('SWAP WITH ' + dapp);
    await helpers.delay(4);

    let router;
    switch (dapp) {
      case 'TOROS':
        router = Dapp.TOROS;
        break;
      default:
        router = Dapp.SUSHISWAP;
    }

    const tx = await pool.trade(
        router,
        addressFrom,
        addressTo,
        helpers.numberToSafeString(amountOfFromToken),
        slippageTolerance,
        _this.gasInfo
    );
    await _this.logTransaction(txsRef, tx, router, 'swap', pool.network, addressFrom, tokens, amountOfFromToken, addressTo);

    return await _this.updateBalances(
        tokens, 
        'swap', 
        amountOfFromToken, 
        addressFrom, 
        addressTo, 
        pool.network, 
        slippageTolerance * 2
    );
}

/**
 * Lend Deposit to AAVE
 * 
 * @param {Pool} pool A dHedge pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens An object with wallet and aave token balances
 * @param {String} address A token's contract address
 * @param {Number} amount Amount to lend, in format compatible with ethers.BigNumber
 * @returns {Promise<Object>} An object with updated wallet and aave token balances
 */
exports.lendDeposit = async (pool, txsRef, tokens, address, amount) => {
    helpers.log('LEND DEPOSIT TO AAVE V2');
    const method = 'lend';
    const dapp = Dapp.AAVE;
    await helpers.delay(4);

    if (_this.isRepeatedlyFailedTransaction(txsRef, method, address, amount, dapp) === true) {
        // Trying to fix an issue with repeat failed transactions
        // const symbol = _this.addressToSymbol(address, pool.network);
        // const decimals = _this.tokens[pool.network][symbol].decimals;
        // amount = _this.decimalToInteger(amount * 0.995, decimals);
        
        helpers.log('WE DID NOT TRY THIS TRANSACTION BECAUSE IT PROBABLY WOULD HAVE FAILED.');
        return tokens;
    }
        
    const tx = await pool.lend(
        dapp, 
        address, 
        helpers.numberToSafeString(amount),
        0,
        _this.gasInfo
    );
    await _this.logTransaction(txsRef, tx, dapp, method, pool.network, address, tokens, amount);

    return await _this.updateBalances(tokens, method, amount, address);
}

/**
 * Borrow Debt from AAVE
 * 
 * @param {Pool} pool A dHedge pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens An object with wallet and aave token balances
 * @param {String} address A token's contract address
 * @param {Number} amount Amount to borrow, in format compatible with ethers.BigNumber
 * @returns {Promise<Object>} An object with updated wallet and aave token balances
 */
exports.borrowDebt = async (pool, txsRef, tokens, address, amount) => {
    helpers.log('BORROW TOKENS FROM AAVE V2');
    await helpers.delay(4);

    const tx = await pool.borrow(
        Dapp.AAVE, 
        address, 
        helpers.numberToSafeString(amount),
        0,
        _this.gasInfo
    );
    await _this.logTransaction(txsRef, tx, Dapp.AAVE, 'borrow', pool.network, address, tokens, amount);

    return await _this.updateBalances(tokens, 'borrow', amount, address);
}

/**
 * Repay Debt to AAVE
 * 
 * @param {Pool} pool A dHedge pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens An object with wallet and aave token balances
 * @param {String} address A token's contract address
 * @param {Number} amount Amount to repay, in format compatible with ethers.BigNumber
 * @returns {Promise<Object>} An object with updated wallet and aave token balances
 */
exports.repayDebt = async (pool, txsRef, tokens, address, amount) => {
    helpers.log('REPAY DEBT ON AAVE V2');
    await helpers.delay(4);

    const tx = await pool.repay(
        Dapp.AAVE, 
        address, 
        helpers.numberToSafeString(amount),
        _this.gasInfo
    );
    await _this.logTransaction(txsRef, tx, Dapp.AAVE, 'repay', pool.network, address, tokens, amount);
    
    return await _this.updateBalances(tokens, 'repay', amount, address);
}

/**
 * Withdraw Debt from AAVE
 * 
 * @param {Pool} pool A dHedge pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens An object with wallet and aave token balances
 * @param {String} address A token's contract address
 * @param {Number} amount Amount to withdraw, in format compatible with ethers.BigNumber
 * @returns {Promise<Object>} An object with updated wallet and aave token balances
 */
exports.withdrawLentTokens = async (pool, txsRef, tokens, address, amount) => {
    helpers.log('WITHDRAW LENT TOKENS FROM AAVE V2');
    await helpers.delay(4);

    const tx = await pool.withdrawDeposit(
        Dapp.AAVE, 
        address, 
        helpers.numberToSafeString(amount), 
        _this.gasInfo
    );
    // helpers.log(tx);
    await _this.logTransaction(txsRef, tx, Dapp.AAVE, 'withdraw', pool.network, address, tokens, amount);

    return await _this.updateBalances(tokens, 'withdraw', amount, address);
}

/**
 * Approve All Spending Once
 * 
 * This method approves the spending of every approved token in the pool
 * on AAVE v2, Uniswap v3, etc.
 * 
 * @param {Pool} pool dHedge Pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Array} dapps A list of dapps to approve
 * @returns {Promise<Boolean>} Boolean true if successful.
 */
exports.approveAllSpendingOnce = async (pool, txsRef, dapps = null) => {
    helpers.log('APPROVING TOKEN USE ON DAPPS');
    
    let dappsToApprove = dapps;
    if (dappsToApprove === null) {
        dappsToApprove = [
            Dapp.AAVE,
            Dapp.UNISWAPV3,
            // Dapp.AAVEV3,
            // Dapp.TOROS,
            // Dapp.SUSHISWAP,
        ];
    }

    const tokens = _this.tokens[pool.network];
    for (const tokenSymbol in tokens) {
        const token = tokens[tokenSymbol];

        for (const dapp of dappsToApprove) {
            helpers.log('Approving spending of ' + token.address + ' on ' + dapp);
            await helpers.delay(4);
            
            const tx = await pool.approve(
                dapp,
                token.address,
                ethers.constants.MaxInt256,
                _this.gasInfo
            );
            await _this.logTransaction(txsRef, tx, dapp, 'approve-spending', pool.network, token.address, null, ethers.constants.MaxInt256);
        }
    }

    return true;
}

/**
 * Is This a Repeatedly Failed Transaction
 * 
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {String} method lend, repay, swap, etc.
 * @param {String} address A token's contract address
 * @param {Number} amount Amount to withdraw, in format compatible with ethers.BigNumber
 * @param {String} dapp The dapp we're using
 */
 exports.isRepeatedlyFailedTransaction = async (txsRef, method, address, amount, dapp) => {
    const transactionsSnapshot = await txsRef.orderBy('createdAt', 'desc').limit(8).get();
    const transactions = helpers.snapshotToArray(transactionsSnapshot);
    let counter = 0;

    if (transactions.length > 0) {

        for (const transaction of transactions) {
            if (transaction.data !== undefined
                && transaction.data._method === method
                && transaction.data.dapp === dapp
                && transaction.data.tokenFrom.address === address
                && transaction.data.amount.balanceInt === amount
                && transaction.data._status === 'fail')
                {
                    counter++;
                }
        }

        if (counter >= 3) {
            return true;
        }
    }

    return false;
}

exports.logTransaction = async (
    txsRef,
    tx,
    dapp,
    callType, 
    network, 
    tokenFromAddress, 
    tokens = null,
    amountFromBn = null, 
    tokenToAddress = null, 
    ) => {
        const tokenFromSymbol = _this.addressToSymbol(tokenFromAddress, network);
        let tokenFrom = tokenTo = null;

        switch(callType) {
            case 'approve-spending':
                tokenFrom = _this.tokens[network][tokenFromSymbol];
                break;

            case 'lend':
                tokenFrom = tokens['wallet'][tokenFromSymbol];
                break;

            case 'borrow':
                tokenFrom = _this.tokens[network][_this.addressToSymbol(tokenFromAddress, network)];
                break;

            case 'repay':
                tokenFrom = tokens['wallet'][tokenFromSymbol];
                break;

            case 'withdraw':
                tokenFrom = tokens['aave']['supply'][tokenFromSymbol];
                break;

            case 'swap':
                tokenFrom = tokens['wallet'][tokenFromSymbol];
                
                tokenTo = (tokens['wallet'][_this.addressToSymbol(tokenToAddress, network)] === undefined) 
                    ? await _this.createNewToken(tokenToAddress, amountFromBn, network)
                    : tokens['wallet'][_this.addressToSymbol(tokenToAddress, network)];

                break;

            default:
                tokenFrom = tokenFromAddress;
                tokenTo = tokenToAddress;
                break;
        }

        helpers.log("TOKEN FROM: " + tokenFromSymbol);
        helpers.log(tokenFrom);

        if (tokenFrom === undefined) {
            helpers.log("TOKENS LIST: ");
            helpers.log(tokens);
            tokenFrom = await _this.createNewToken(tokenFromAddress, amountFromBn, network)
        }

        // Get as much detail as we can about the AMOUNT
        tokenFromUsdPrice = (tokenFrom.usdPrice === undefined || tokenFrom.usdPrice === null) ? null : tokenFrom.usdPrice
        const amount = _this.getBalanceInfo(amountFromBn, tokenFrom.decimals, tokenFromUsdPrice);

        // CLEAN OUT BIGNUMBERS
        delete tokenFrom.balanceBn;
        delete amount.balanceBn;
        delete tx.maxPriorityFeePerGas;
        delete tx.maxFeePerGas;
        delete tx.gasLimit;
        delete tx.value;
        delete tx.wait;

        if (tokens !== null) {
            for (const walletSymbol in tokens['wallet']) {
                delete tokens['wallet'][walletSymbol].balanceBn
            }
            for (const walletSymbol in tokens['aave']['supply']) {
                delete tokens['aave']['supply'][walletSymbol].balanceBn
            }
            for (const walletSymbol in tokens['aave']['variable-debt']) {
                delete tokens['aave']['variable-debt'][walletSymbol].balanceBn
            }
        }
        
        /**
         * @todo: change this once we support other networks
         */
        const basepath = 'https://polygonscan.com/tx/';
        
        let data = {
            createdAt: helpers.getFirestoreUtcTimestamp()
            , _method: callType
            , _url: basepath + tx.hash
            , amount: amount
            , balances: tokens
            , dapp: dapp
            , network: network
            , rawTransaction: tx
            , tokenFrom: tokenFrom
        };

        if (tokenTo !== null) {
            delete tokenTo.balanceBn;
            data.tokenTo = tokenTo;
        }

        // Save the new signal
        const transaction = await txsRef.doc().set(data);

        helpers.log("TRANSACTION DETAILS...");
        helpers.log(data);

        return transaction;
}