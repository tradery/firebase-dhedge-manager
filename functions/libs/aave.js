const _ = require('lodash');
const helpers = require('./helpers');
const dhedge = require('./dhedge');
const _this = this;

exports.maxLeverage = 5;
exports.liquidationHealthFloor = 1.08;
exports.liquidationHealthTargetFloor = 1.25;
exports.liquidationHealthTargetCeiling = 1.45;

/**
 * Reduce Debt
 * 
 * @param {Pool} pool A dHedge Pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens A list of wallet and aave token balances
 * @param {Float} maxLeverage The leverage target to reach before quitting. Defaults to `5`.
 * @param {Float} liquidationHealthTarget The liquidation health target to reach before quitting; Use `null` to empty all debt.
 * @returns {Promise<Object>} Updated wallet and aave balances
 */
exports.reduceDebt = async (pool, txsRef, tokens, maxLeverage = _this.maxLeverage, liquidationHealthTarget = null) => {
    // Check to see if we have any debt to repay
    if (_this.isDebtSufficientlyRepaid(tokens, maxLeverage, liquidationHealthTarget) === true) {
            helpers.log('We don\'t need to reduce the debt so we can exit.');
            return tokens;
    }

    // Get the debt token symbol
    const debtSymbol = _.keys(tokens['aave']['variable-debt'])[0];

    // Try to pay down our debt from any debt tokens in our wallet
    // This step may save us from doing swap transactions
    if (tokens['wallet'][debtSymbol] !== undefined
        && tokens['wallet'][debtSymbol].balanceUsd >= 0.50) {
            helpers.log('REPAYING ' + debtSymbol + ' DEBT FROM ' + debtSymbol + ' IN OUR WALLET ASSETS');
            const token = tokens['wallet'][debtSymbol];
            tokens = await _this.repayDebt(pool, txsRef, tokens, token, 'wallet', maxLeverage, liquidationHealthTarget);

            // Exit if our debt is suffiently paid off
            if (_this.isDebtSufficientlyRepaid(tokens, maxLeverage, liquidationHealthTarget) === true) return tokens;
    }

    // If we're here then our debt is not paid off
    // Now we'll go through the rest of our wallet tokens to pay more debt
    for (const tokenSymbol in tokens['wallet']) {
        if (tokenSymbol !== debtSymbol && tokens['wallet'][tokenSymbol].balanceUsd >= 0.50) {
            helpers.log('REPAYING ' + debtSymbol + ' DEBT FROM ' + tokenSymbol + ' IN OUR WALLET ASSETS');
            const token = tokens['wallet'][tokenSymbol];
            tokens = await _this.repayDebt(pool, txsRef, tokens, token, 'wallet', maxLeverage, liquidationHealthTarget);

            // Exit if our debt is suffiently paid off
            if (_this.isDebtSufficientlyRepaid(tokens, maxLeverage, liquidationHealthTarget) === true) return tokens;
        }
    }
    
    /**
     * @TODO Fix the infinite loop issue when setting max leverage.
     */
    // If we're here then our debt is not paid off
    // Now we'll start selling supply tokens to pay more debt
    let killCounter = 0;
    while (_this.isDebtSufficientlyRepaid(tokens, maxLeverage, liquidationHealthTarget) === false
           && killCounter < 6) {

        // Loop through our supply tokens
        for (const supplyTokenSymbol in tokens['aave']['supply']) {
            helpers.log('REPAYING ' + debtSymbol + ' DEBT FROM ' + supplyTokenSymbol + ' IN OUR AAVE SUPPLY');
            const supplyToken = tokens['aave']['supply'][supplyTokenSymbol];
            tokens = await _this.repayDebt(pool, txsRef, tokens, supplyToken, 'supply', maxLeverage, _this.liquidationHealthFloor);

            // Exit if our debt is suffiently paid off
            if (_this.isDebtSufficientlyRepaid(tokens, maxLeverage, liquidationHealthTarget) === true) return tokens;
        }

        killCounter++;
    }

    return tokens;
}

/**
 * Repay Debt
 * 
 * @param {Pool} pool A dHedge Pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens A list of wallet and aave tokens with balances
 * @param {Object} token A token with balance details
 * @param {String} sourceOfFunds wallet or supply
 * @param {Float} maxLeverage The leverage target to reach before quitting. Defaults to `5`.
 * @param {Float} liquidationHealthTarget Target liquidation health. Defaults to `null`.
 * @returns {Promise<Object>} A list of wallet and aave tokens with updated balances
 */
exports.repayDebt = async (
    pool, 
    txsRef, 
    tokens, 
    repaymentToken, 
    sourceOfFunds = 'wallet', 
    maxLeverage = _this.maxLeverage, 
    liquidationHealthTarget = null) => {
        const debtSymbol = _.keys(tokens['aave']['variable-debt'])[0];
        const debtToken = tokens['aave']['variable-debt'][debtSymbol];
        const repaymentTarget = _this.getDebtAdjustmentAmount(tokens, sourceOfFunds, maxLeverage, liquidationHealthTarget);

        helpers.log("repaymentTarget amount: " + repaymentTarget);

        // Try to repay as much debt as possible using this token            
        let debtToRepayUsd = _.min([repaymentTarget, repaymentToken.balanceUsd]);
        let debtToRepayInt = _this.tokenIntFromUsdAmount(repaymentToken, debtToRepayUsd);

        helpers.log("debtToRepayUsd amount: " + debtToRepayUsd);

        // Check to ensure we don't have a calculation mistake
        if (debtToRepayUsd <= 0) return tokens;

        if (sourceOfFunds === 'supply') {
            const maxSafeSupplyWithdraw = _this.getMaxSafeSupplyWithdraw(
                tokens['aave'].supplyBalanceUsd, 
                tokens['aave'].debtBalanceUsd, 
                tokens['aave'].liquidationThreshold
            );

            // Try to repay as much debt as possible
            debtToRepayUsd = _.min([repaymentTarget, maxSafeSupplyWithdraw, repaymentToken.balanceUsd]);
            debtToRepayInt = _this.tokenIntFromUsdAmount(repaymentToken, debtToRepayUsd);

            // Check to ensure we don't have a calculation mistake
            if (debtToRepayUsd <= 0) return tokens;

            // WITHDRAW SUPPLY
            helpers.log('Withdrawing $' + debtToRepayUsd + ' worth of ' + repaymentToken.symbol + ' from AAVE supply');
            tokens = await dhedge.withdrawLentTokens(pool, txsRef, tokens, repaymentToken.address, debtToRepayInt);
        }

        if (repaymentToken.address !== debtToken.address) {
            // SWAP OUR WALLET TOKEN INTO THE TOKEN THAT MATCHES THE DEBT TOKEN
            helpers.log(
                'Swapping ~$' + (dhedge.slippageMultiplier() * debtToRepayUsd)
                + ' worth of ' + repaymentToken.symbol + ' for ' + debtSymbol + ' on Uniswap'
            );
            tokens = await dhedge.tradeUniswap(
                pool,
                txsRef, 
                tokens,
                repaymentToken.address,
                debtToken.address,
                debtToRepayInt
            );

            debtToRepayInt = _this.tokenIntFromUsdAmount(debtToken, dhedge.slippageMultiplier() * debtToRepayUsd);
        }

        // REPAY DEBT
        helpers.log('Repaying $' + debtToRepayUsd + ' worth of ' + debtSymbol + ' on AAVE');
        tokens = await dhedge.repayDebt(pool, txsRef, tokens, debtToken.address, debtToRepayInt);

        return tokens;
}

/**
 * Is it Safe to Borrow?
 * 
 * @param {Object} tokens A list of wallet and aave token balances.
 * @param {Float} maxLeverage The leverage target to reach before quitting. Defaults to `5`.
 * @param {Float} liquidationHealthTarget The liquidation health target to reach before quitting.
 * @returns {Boolean} `True` if yes, `false` if no.
 */
exports.isSafeToBorrow = (
    tokens, 
    maxLeverage = _this.maxLeverage, 
    liquidationHealthTarget = _this.liquidationHealthTargetCeiling
    ) => {
        if (tokens['aave']['liquidationHealth'] === null
            || (tokens['aave']['leverage'] < maxLeverage
                && tokens['aave']['liquidationHealth'] > liquidationHealthTarget)
            ) {
                return true;
        }

        return false;
}

/**
 * Increase Debt
 * 
 * @param {Pool} pool A dHedge Pool object
 * @param {Object} txsRef A firestore database reference mapped to `transactions`
 * @param {Object} tokens A list of wallet and aave token balances
 * @param {String} shortSymbol A symbol for the short token
 * @param {String} longSymbol A symbol for the long token
 * @param {Float} maxLeverage The leverage target to reach before quitting. Defaults to `5`.
 * @param {Float} liquidationHealthTarget The liquidation health target to reach before quitting.
 * @returns {Promise<Object>} Updated wallet and aave balances
 */
exports.increaseDebt = async (
    pool, 
    txsRef, 
    tokens, 
    shortSymbol,
    longSymbol,
    maxLeverage = _this.maxLeverage, 
    liquidationHealthTarget = _this.liquidationHealthTargetCeiling
    ) => {
        // Check to see if we have room to take on more debt
        while (_this.isSafeToBorrow(tokens, maxLeverage, liquidationHealthTarget) === true) {

            helpers.log('INCREASING DEBT...'
                + ' It\'s safe to borrow more ' + shortSymbol
                + ' and swap into ' + longSymbol
                + ' until we reach target max leverage of ' + maxLeverage
                + ' or our liquidaton health target of ' + liquidationHealthTarget
            );

            // Calculate max debt to borrow
            const maxLtv = tokens['aave']['liquidationThreshold'] - 0.07;
            const maxDebtBasedOnLtv = (tokens['aave']['supplyBalanceUsd'] * maxLtv) - tokens['aave']['debtBalanceUsd'];
            const maxDebtBasedOnMaxLeverage = ((tokens['aave']['supplyBalanceUsd'] - tokens['aave']['debtBalanceUsd']) * maxLeverage) - tokens['aave']['supplyBalanceUsd'];
            const debtToBorrowUsd = _.min([maxDebtBasedOnLtv, maxDebtBasedOnMaxLeverage]);

            if (debtToBorrowUsd > 0.50) {
                // Get our short token
                const token = (tokens['wallet'][shortSymbol] === undefined)
                    ? await dhedge.createNewToken(dhedge.symbolToAddress(shortSymbol, pool.network), 0, pool.network)
                    : tokens['wallet'][shortSymbol];
                
                // Calculate max debt to borrow as int
                const debtToBorrowInt = _this.tokenIntFromUsdAmount(token, debtToBorrowUsd);

                // Borrow max debt
                helpers.log('Borrowing ~$' + debtToBorrowUsd + ' (' + debtToBorrowInt + ') worth of ' + shortSymbol + ' from AAVE');
                helpers.log(token);
                tokens = await dhedge.borrowDebt(pool, txsRef, tokens, token.address, debtToBorrowInt);

                // UniswapV3 into Long tokens
                helpers.log('Swapping ~$' + debtToBorrowUsd + ' worth of ' + shortSymbol + ' into ' + longSymbol + ' on Uniswap');
                tokens = await dhedge.tradeUniswap(pool, txsRef, tokens, token.address, dhedge.symbolToAddress(longSymbol, pool.network), debtToBorrowInt);

                // Lend Long tokens to AAVE
                const longToken = tokens['wallet'][longSymbol];
                helpers.log('Lending ~$' + longToken.balanceUsd + ' worth of ' + longSymbol + ' to AAVE supply');
                tokens = await dhedge.lendDeposit(pool, txsRef, tokens, longToken.address, longToken.balanceInt);
            }
        }

        return tokens;
}


/**
 * Get Debt Adjustment Amount
 * 
 * @todo Consider if maxLeverage is needed or if it should be removed.
 * 
 * @param {Object} tokens A list of wallet and aave tokens with balances
 * @param {String} sourceOfFunds wallet, supply, or debt
 * @param {Float} maxLeverage The leverage target to reach before quitting. Defaults to `5`.
 * @param {Float} liquidationHealthTarget The liquidation health target. Defaults to `null`.
 * @returns {Float} The amount of USD to adjust the debt by.
 */
exports.getDebtAdjustmentAmount = (tokens, sourceOfFunds = 'wallet', maxLeverage, liquidationHealthTarget = null) => {
    const overpayBufferMultiple = 1.04;
    let amount = 0;
    
    if (liquidationHealthTarget !== null) {
        // It turns out that we're not adjusting all debt... just some of it
        // Here we figure out how much we'd like to pay down or borrow
        switch(sourceOfFunds) {
            case 'supply':
                // Used when trying to pay down debt from our supply
                amount = _this.getDebtAndSupplyOffset(
                    tokens['aave'].supplyBalanceUsd, 
                    tokens['aave'].debtBalanceUsd, 
                    tokens['aave'].liquidationThreshold, 
                    liquidationHealthTarget,
                );

                if (amount <= 0) {
                    amount = tokens['aave']['supplyBalanceUsd'] - ((tokens['aave']['supplyBalanceUsd'] - tokens['aave']['debtBalanceUsd']));
                }

                amount *= overpayBufferMultiple;
                break;

            case 'debt':
                // Used when trying to figure out how much more debt we can borrow
                amount = _this.getDebtOffset(
                    tokens['aave'].supplyBalanceUsd, 
                    tokens['aave'].debtBalanceUsd, 
                    tokens['aave'].liquidationThreshold, 
                    liquidationHealthTarget,
                );
                break;

            case 'wallet':
                // fall through
            default:
                // Used when trying to pay down debt from our wallet
                amount = _this.getDebtOffset(
                    tokens['aave'].supplyBalanceUsd, 
                    tokens['aave'].debtBalanceUsd, 
                    tokens['aave'].liquidationThreshold, 
                    liquidationHealthTarget,
                ) * overpayBufferMultiple;
                break;
        }
    } else {
        // We're trying to clear all the debt
        amount = tokens['aave'].debtBalanceUsd * overpayBufferMultiple;
    }

    return amount;
}

/**
 * Is Debt Sufficiently Repaid
 * 
 * @param {Object} tokens A list of wallet and aave tokens with balances
 * @param {Float} maxLeverage The maximum leverage for borrowing. Defaults to global max leverage target.
 * @param {Float} liquidationHealthTarget The liquidation health target. Defaults to `null`.
 * @returns {Boolean} True if the debt is sufficiently repaid; false if there is more to pay
 */
exports.isDebtSufficientlyRepaid = (tokens, maxLeverage = _this.maxLeverage, liquidationHealthTarget = null) => {
    if (_.isEmpty(tokens['aave']['variable-debt'])
        || tokens['aave'].liquidationHealth === null
        || (liquidationHealthTarget !== null
            && tokens['aave']['leverage'] <= maxLeverage
            && tokens['aave'].liquidationHealth >= liquidationHealthTarget)
        ) {
            return true;
    }

    return false;
}

/**
 * Get Supply Offset
 * 
 * Use when increasing the supply with wallet assets to reach a liquidation health target.
 * 
 * @param {Float} supplyUsd Amount of supply in USD
 * @param {Float} debtUsd Amount of debt in USD
 * @param {Float} liquidationThreshold Liquidation threshold for supply tokens
 * @param {Float} liquidationHealthTarget Target liquidation health
 * @returns {Float} Negative number of we need to reduce supply; Positive number if we need to increase supply
 */
exports.getSupplyOffset = (supplyUsd, debtUsd, liquidationThreshold, liquidationHealthTarget) => {
    const debtRatio = debtUsd / supplyUsd;
    const targetDebtRatio = liquidationThreshold / liquidationHealthTarget;
    const offsetRatio = (debtRatio / targetDebtRatio) - 1;
    const offsetAmount = supplyUsd * offsetRatio;
    return offsetAmount;
}

/**
 * Get Debt Offset
 * 
 * Use when decreasing debt with wallet assets to reach a liquidation health target
 * 
 * @param {Float} supplyUsd Amount of supply in USD
 * @param {Float} debtUsd Amount of debt in USD
 * @param {Float} liquidationThreshold Liquidation threshold for supply tokens
 * @param {Float} liquidationHealthTarget Target liquidation health
 * @returns {Float} Postive number if we need to reduce debt; Negative number if we need to increase debt
 */
exports.getDebtOffset = (supplyUsd, debtUsd, liquidationThreshold, liquidationHealthTarget) => {
    // Problem:  solve for a: a / b = c 
    // Solution: a = b * c
    const targetDebtRatio = liquidationThreshold / liquidationHealthTarget;
    return debtUsd - (supplyUsd * targetDebtRatio);
}

/**
 * Get Debt & Supply Offset
 * 
 * Use when decreasing supply to repay debt to reach a liquidation health target
 * 
 * @param {Float} supplyUsd Amount of supply in USD
 * @param {Float} debtUsd Amount of debt in USD
 * @param {Float} liquidationThreshold Liquidation threshold for supply tokens
 * @param {Float} liquidationHealthTarget Target liquidation health
 * @returns {Float} Postive number if we need to reduce debt; Negative number if we need to increase debt
 */
exports.getDebtAndSupplyOffset = (supplyUsd, debtUsd, liquidationThreshold, liquidationHealthTarget) => {
    // Problem:  solve for n: (a-n)/(b-n) = c 
    // Solution: n = (-a + (b * c))/(-1 + c)
    const targetDebtRatio = liquidationThreshold / liquidationHealthTarget;
    return (-debtUsd + (supplyUsd * targetDebtRatio)) / (-1 + targetDebtRatio);
}

/**
 * Get Maximum Safe Supply Withdraw Amount
 * 
 * Use when decreasing supply to repay debt with breaking a liquidation floor
 * 
 * @param {Float} supplyUsd Amount of supply in USD
 * @param {Float} debtUsd Amount of debt in USD
 * @param {Float} liquidationThreshold Liquidation threshold for supply tokens
 * @param {Float} liquidationHealthFloor Liquidation health floor that we can't go below. Defaults to global variable (`1.05`).
 * @returns {Float} Postive number if it is safe to reduce supply
 */
exports.getMaxSafeSupplyWithdraw = (supplyUsd, debtUsd, liquidationThreshold, liquidationHealthFloor = _this.liquidationHealthFloor) => {
    // Problem:  solve for c: a / (b / c) = d
    // Solution: d = c - ((b * d) / a)
    return supplyUsd - ((debtUsd * liquidationHealthFloor) / liquidationThreshold);
}

/**
 * Get Token Integer Amount from USD Amount
 * 
 * @param {Object} token A token object with balance details
 * @param {Float} amount The amount in USD to convert to an integer
 * @returns {Number} The number of tokens needed to match the USD amount
 */
exports.tokenIntFromUsdAmount = (token, amount) => {
    return dhedge.decimalToInteger(
        amount / token.usdPrice, 
        token.decimals
    );
}
