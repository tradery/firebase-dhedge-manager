const _ = require('lodash');
const helpers = require('./helpers');
const dhedge = require('./dhedge');
const _this = this;

exports.liquidationHealthTargetFloor = 1.3;
exports.liquidationHealthTargetCeiling = 1.5;

/**
 * Get Supply Offset
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
 * @param {Float} supplyUsd Amount of supply in USD
 * @param {Float} debtUsd Amount of debt in USD
 * @param {Float} liquidationThreshold Liquidation threshold for supply tokens
 * @param {Float} liquidationHealthTarget Target liquidation health
 * @returns {Float} Postive number if we need to reduce debt; Negative number if we need to increase debt
 */
exports.getDebtOffset = (supplyUsd, debtUsd, liquidationThreshold, liquidationHealthTarget) => {
    // Problem:  solve for n: (a-n)/(b-n) = c 
    // Solution: (-a + b c)/(-1 + c)
    const targetDebtRatio = liquidationThreshold / liquidationHealthTarget;
    return debtUsd - (supplyUsd * targetDebtRatio);
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

/**
 * Repay Debt
 * 
 * @param {Object} tokens A list of wallet and aave tokens with balances
 * @param {Object} token A token with balance details
 * @param {Float} liquidationHealthTarget The liquidation health target. Defaults to `null`.
 * @returns {Promise<Object>} A list of wallet and aave tokens with updated balances
 */
exports.repayDebt = async (pool, tokens, token, liquidationHealthTarget = null) => {
    let remainingDebtToRepayUsd = tokens['aave'].debtBalanceUsd;

    if (liquidationHealthTarget !== null) {
        // We're not repaying all debt... just some of it
        // Here we figure out how much we'd like to pay down
        remainingDebtToRepayUsd = _this.getDebtOffset(
            tokens['aave'].supplyBalanceUsd, 
            tokens['aave'].debtBalanceUsd, 
            tokens['aave'].liquidationThreshold, 
            liquidationHealthTarget,
        );

        // Return if we're above our liquidationHealthTarget
        if (remainingDebtToRepayUsd <= 0) {
            return tokens;
        }
    }

    // Include a buffer for usd to int conversions
    remainingDebtToRepayUsd *= 1.015

    // Try to repay as much debt as possible using this token
    const debtToRepayUsd = (token.balanceUsd < remainingDebtToRepayUsd) ?
        token.balanceUsd :
        remainingDebtToRepayUsd;
    const debtToRepayInt = _this.tokenIntFromUsdAmount(token, debtToRepayUsd);
    
    // PAY DOWN DEBT
    helpers.log('Repaying $' + debtToRepayUsd + ' worth of ' + token.symbol + ' on AAVE');
    tokens = await dhedge.repayDebt(pool, tokens, token.address, debtToRepayInt);

    return tokens;
}

/**
 * Is Debt Sufficiently Repaid
 * 
 * @param {Object} tokens A list of wallet and aave tokens with balances
 * @param {Float} liquidationHealthTarget The liquidation health target. Defaults to `null`.
 * @returns {Boolean} True if the debt is sufficiently repaid; false if there is more to pay
 */
exports.isDebtSufficientlyRepaid = (tokens, liquidationHealthTarget = null) => {
    if (_.isEmpty(tokens['aave']['variable-debt'])
        || tokens['aave'].liquidationHealth === null
        || (liquidationHealthTarget !== null
            && tokens['aave'].liquidationHealth > liquidationHealthTarget)
        ) {
            return true;
    }
    return false;
}

/**
 * Reduce Debt
 * 
 * @param {Pool} pool A dHedge Pool object
 * @param {Object} aaveBalances A clean aave-balances object from Zapper library
 * @param {Object} walletBalances A clean wallet-balances object from dHedge library
 * @param {Float} liquidationHealthTarget The liquidation health target to reach before quitting; Use `null` to empty all debt
 * @returns {Promise<Object>} Updated wallet and aave balances
 */
exports.reduceDebt = async (pool, tokens, liquidationHealthTarget = null) => {
    // Check to see if we have any debt to repay
    if (_this.isDebtSufficientlyRepaid(tokens, liquidationHealthTarget) === true) {
            helpers.log('Can\'t reduce debt because no debt exists.');
            return tokens;
    }
    
    // Get the debt token symbol
    const debtSymbol = _.keys(tokens['aave']['variable-debt'])[0];

    // Try to pay down our debt from any debt tokens in our wallet
    // This step may save us from doing swap transactions
    if (tokens['wallet'][debtSymbol] !== undefined
        && tokens['wallet'][debtSymbol].balanceInt > 0) {
            const token = tokens['wallet'][debtSymbol]
            tokens = await _this.repayDebt(pool, tokens, token, liquidationHealthTarget);

            // Exit if our debt is suffiently paid off
            if(_this.isDebtSufficientlyRepaid(tokens, liquidationHealthTarget) === true) return tokens;
    }

    // If we're here then our debt is not paid off
    // Now we'll go through the rest of our wallet tokens to pay more debt
    for (const tokenSymbol in tokens['wallet']) {
        if (tokenSymbol !== debtSymbol) {
            const token = tokens['wallet'][tokenSymbol];

            // SWAP OUR WALLET TOKEN INTO THE TOKEN THAT MATCHES THE DEBT TOKEN
            helpers.log(
                'Swapping ~$' + (dhedge.slippageMultiplier() * token.balanceUsd)
                 + ' worth of ' + token.symbol + ' for ' + debtSymbol + ' on Uniswap'
            );
            tokens = await dhedge.tradeUniswap(
                pool,
                tokens,
                token.address,
                dhedge.symbolToAddress(debtSymbol, network),
                token.balanceInt
            );

            tokens = await _this.repayDebt(tokens, tokens['wallet'][debtSymbol], liquidationHealthTarget);

            // Exit if our debt is suffiently paid off
            if(_this.isDebtSufficientlyRepaid(tokens, liquidationHealthTarget) === true) return tokens;
        }
    }
    
    // If we're here then our debt is not paid off
    // Now we'll start selling supply tokens to pay more debt
    while (_this.isDebtSufficientlyRepaid(tokens, liquidationHealthTarget) === false) {
        
        // Loop through our supply tokens
        for (const supplyTokenSymbol in tokens['aave']['supply']) {
            const supplyToken = tokens['aave']['supply'][supplyTokenSymbol];

            /**
             * @TODO make this smarter because it's a hack; also handle negative numbers if liquidation health is below 1
             */
            // Determine how much supply we can safely use to pay down debt
            const safeSupplyWithdrawMultiple = tokens['aave']['liquidationHealth'] - 1.05
            const maxSafeSupplyToWithdraw = tokens['aave']['supplyBalanceUsd'] * safeSupplyWithdrawMultiple;

            // Try to repay as much debt as possible using this token
            // Note that we might have to drain this token's supply and still use other token supply as well
            const debtToRepayUsd = (supplyToken.balanceUsd < maxSafeSupplyToWithdraw) ?
                supplyToken.balanceUsd :
                maxSafeSupplyToWithdraw;
            
            // Calculate the repayment values as an integers so Ethers can understand the values
            const debtToRepayInt = _this.tokenIntFromUsdAmount(supplyToken, debtToRepayUsd);

            // WITHDRAW SUPPLY
            helpers.log('Withdrawing $' + debtToRepayUsd + ' worth of ' + supplyToken.symbol + ' from AAVE');
            tokens = await dhedge.withdrawLentTokens(pool, tokens, supplyToken.address, debtToRepayInt);
            
            // SWAP INTO DEBT REPAYMENT TOKEN
            helpers.log(
                'Swapping ~$' + (dhedge.slippageMultiplier() * supplyToken.balanceUsd)
                 + ' worth of ' + supplyToken.symbol + ' for ' + debtSymbol + ' on Uniswap'
            );
            tokens = await dhedge.tradeUniswap(
                pool,
                tokens,
                supplyToken.address,
                dhedge.symbolToAddress(debtSymbol, network),
                supplyToken.balanceInt
            );

            // PAY DOWN DEBT
            helpers.log('Repaying $' + debtToRepayUsd + ' worth of ' + debtSymbol + ' on AAVE');
            tokens = await dhedge.repayDebt(
                pool, 
                tokens, 
                dhedge.symbolToAddress(debtSymbol, network), 
                tokens['wallet'][debtSymbol].balanceInt
            );

            // Exit if our debt is suffiently paid off
            if(_this.isDebtSufficientlyRepaid(tokens, liquidationHealthTarget) === true) return tokens;
        }
    }

    return tokens;
}