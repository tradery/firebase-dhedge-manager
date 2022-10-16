const helpers = require('./helpers');
const dhedge = require('./dhedge');
const _this = this;

exports.liquidationHealthTargetFloor = 1.3;
exports.liquidationHealthTargetCeiling = 1.5;

exports.getTargetWithdrawlAmount = (supplyUsd, debtUsd, liquidationThreshold, liquidationHealthTarget) => {
    const debtRatio = debtUsd / supplyUsd;
    const targetLiquidationThreshold = liquidationThreshold / liquidationHealthTarget;
    const offsetRatio = (debtRatio / targetLiquidationThreshold) - 1;
    const withdrawlAmount = supplyUsd * offsetRatio;
    return withdrawlAmount;
}

/**
 * Reduce Debt
 * 
 * @param {Pool} pool A dHedge Pool object
 * @param {Object} aaveBalances A clean aave-balances object from Zapper library
 * @param {Object} walletBalances A clean wallet-balances object from dHedge library
 * @param {Float} liquidationHealthTarget The liquidation health target to reach before quitting; Use `null` to empty all debt
 * @returns {Object} Updated wallet and aave balances
 */
exports.reduceDebt = async (pool, aaveBalances, walletBalances, liquidationHealthTarget = null) => {
    // We have no debt
    if (aaveBalances === undefined
        || aaveBalances['variable-debt'].length === 0
        || aaveBalances.liquidationHealth === null) {
            helpers.log('Can\'t reduce debt because no debt exists.');
            return false;
    }

    // Set max slippage 
    // @TODO pull this from the dhedge library
    const maxSlippageMultiplier = 0.99;

    // The Liquidation Threshold is a constant related to the supply token(s)
    const liquidationThreshold = aaveBalances.liquidationThreshold;

    // Get our token addresses
    /**
     * @TODO Put defence around this so that we don't get the
     * "Cannot read property '0' of undefined" error when we have no
     * debt but are trying to rebalance debt.
     */
    const debtTokenAddress = aaveBalances['variable-debt'][0].address;
    
    // Setup our current values
    let remainingDebtToRepayUsd = currentDebtUsd = aaveBalances.debtBalanceUsd * 1.03;
    let currentSupplyUsd = aaveBalances.supplyBalanceUsd;
    let currentHealth = aaveBalances.liquidationHealth;
    let updatedBalances = {
        'wallet': walletBalances,
        'aave':   aaveBalances
    };

    // Do we have enough in our wallet to pay down the debt?
    for (const token of walletBalances) {
        if (token.address === debtTokenAddress
            && token.balanceUsd > 0) {
            if (liquidationHealthTarget !== null) {
                // We're not repaying all debt... just some of it
                // Here we figure out how much we'd like to pay down
                remainingDebtToRepayUsd = _this.getTargetWithdrawlAmount(
                    currentSupplyUsd, 
                    currentDebtUsd, 
                    liquidationThreshold, 
                    liquidationHealthTarget,
                );
            }
            
            // Try to repay as much debt as possible from our wallet        
            let debtToRepayUsdFromWallet = (remainingDebtToRepayUsd > token.balanceUsd) ? 
                token.balanceUsd :
                remainingDebtToRepayUsd;

            const debtToRepayInteger = dhedge.decimalToInteger(
                debtToRepayUsdFromWallet / token.usdPrice, 
                token.decimals
            );

            // REPAY DEBT FROM WALLET
            helpers.log('Repaying $' + debtToRepayUsdFromWallet + ' worth of ' + token.symbol + ' on AAVE from wallet');
            await dhedge.repayDebt(pool, debtTokenAddress, debtToRepayInteger);

            // Track the changes to wallet and debt balances due to debt repayment
            updatedBalances['wallet'] = await dhedge.updateTokenBalance(
                updatedBalances['wallet'], 
                debtTokenAddress, 
                -debtToRepayInteger,
                pool.network);
            updatedBalances['aave']['variable-debt'] = await dhedge.updateTokenBalance(
                updatedBalances['aave']['variable-debt'],
                debtTokenAddress,
                -debtToRepayInteger,
                pool.network);

            // EXIT OR RECALCULATE REMAINING DEBT TO REPAY
            if (remainingDebtToRepayUsd === debtToRepayUsdFromWallet) {
                return updatedBalances;
            } else {
                currentDebtUsd -= debtToRepayUsdFromWallet;
                currentHealth = liquidationThreshold / (currentDebtUsd / currentSupplyUsd);
                remainingDebtToRepayUsd -= debtToRepayUsdFromWallet;
            }
        }
    }

    // Loop as many times as needed to reduce all the debt
    do {
        // Check to see if we can safely exit this method because our debt ratio 
        // is already above the specified liquidation health target
        if (liquidationHealthTarget !== null
            && currentHealth > liquidationHealthTarget) {
                return updatedBalances;
        }

        if (liquidationHealthTarget !== null) {
            // We're not repaying all debt... just some of it
            // Here we figure out how much we'd like to pay down
            remainingDebtToRepayUsd = _this.getTargetWithdrawlAmount(
                currentSupplyUsd, 
                currentDebtUsd, 
                liquidationThreshold, 
                liquidationHealthTarget,
            );
        }
        
        // Determine how much supply we can safely use to pay down debt
        // @TODO handle negative numbers if liquidation health is below 1
        const safeSupplyWithdrawMultiple = currentHealth - 1.05
        const maxSafeSupplyToWithdraw = currentSupplyUsd * safeSupplyWithdrawMultiple;
        
        // Try to repay as much debt as possible per while loop        
        let debtToRepayThisLoopUsd = (remainingDebtToRepayUsd > maxSafeSupplyToWithdraw) ? 
            maxSafeSupplyToWithdraw :
            remainingDebtToRepayUsd;

        // We might have more than one supply token
        for (const token of aaveBalances['supply']) {
            // We might have to drain this token's supply and still use other token supply as well
            let debtToRepayThisSubLoopUsd = (debtToRepayThisLoopUsd > token.balanceUsd) ? 
                token.balanceUsd :
                debtToRepayThisLoopUsd;

            // Calculate the repayment values as an integers so Ethers can understand the values
            const debtToRepayInteger = dhedge.decimalToInteger(
                debtToRepayThisSubLoopUsd / token.usdPrice, 
                token.decimals
            );
            
            // WITHDRAW SUPPLY TOKENS
            helpers.log('Withdrawing $' + debtToRepayThisSubLoopUsd + ' worth of ' + token.symbol + ' from AAVE');
            await dhedge.withdrawLentTokens(pool, token.address, debtToRepayInteger);

            // Track the changes to supply balances due to withdraw
            updatedBalances['wallet'] = await dhedge.updateTokenBalance(
                updatedBalances['wallet'],
                token.address,
                debtToRepayInteger,
                pool.network);
            updatedBalances['aave']['supply'] = await dhedge.updateTokenBalance(
                updatedBalances['aave']['supply'],
                token.address,
                -debtToRepayInteger,
                pool.network);

            // SWAP TO DEBT TOKENS
            helpers.log(
                'Swapping ~$' + (maxSlippageMultiplier * debtToRepayThisSubLoopUsd)
                 + ' worth of ' + token.symbol + ' for ' + aaveBalances['variable-debt'][0].symbol + ' on Uniswap'
            );
            const slippage = ((1 - maxSlippageMultiplier) * 100) / 2;
            await dhedge.tradeUniswap(pool, token.address, debtTokenAddress, debtToRepayInteger, slippage);

            const estimatedSwapInteger = dhedge.decimalToInteger(
                maxSlippageMultiplier * (debtToRepayThisSubLoopUsd / aaveBalances['variable-debt'][0].usdPrice), 
                aaveBalances['variable-debt'][0].decimals
            );

            // Track the changes to supply balances due to swap
            updatedBalances['wallet'] = await dhedge.updateTokenBalance(
                updatedBalances['wallet'],
                token.address,
                -debtToRepayInteger,
                pool.network);
            updatedBalances['wallet'] = await dhedge.updateTokenBalance(
                updatedBalances['wallet'],
                debtTokenAddress,
                estimatedSwapInteger,
                pool.network);

            // REPAY DEBT
            helpers.log(
                'Repaying ~$' + (maxSlippageMultiplier * debtToRepayThisSubLoopUsd)
                 + ' worth of ' + aaveBalances['variable-debt'][0].symbol + ' on AAVE');
            await dhedge.repayDebt(pool, debtTokenAddress, estimatedSwapInteger);

            // Track the changes to wallet and debt balances due to debt repayment
            updatedBalances['wallet'] = await dhedge.updateTokenBalance(
                updatedBalances['wallet'], 
                debtTokenAddress, 
                -debtToRepayInteger,
                pool.network);
            updatedBalances['aave']['variable-debt'] = await dhedge.updateTokenBalance(
                updatedBalances['aave']['variable-debt'],
                debtTokenAddress,
                -debtToRepayInteger,
                pool.network);

            // RECALCULATE
            // current supply, debt, health, and remaining debt to repay
            remainingDebtToRepayUsd -= debtToRepayThisSubLoopUsd;
            currentSupplyUsd -= debtToRepayThisSubLoopUsd;
            currentDebtUsd -= debtToRepayThisSubLoopUsd;
            currentHealth = liquidationThreshold / (currentDebtUsd / currentSupplyUsd);

            // Debug info
            helpers.log({
                'remainingDebtToRepayUsd': remainingDebtToRepayUsd,
                'currentSupplyUsd': currentSupplyUsd,
                'currentDebtUsd': currentDebtUsd,
                'currentHealth': currentHealth,
            });

            // At the end...
            if (debtToRepayThisLoopUsd === debtToRepayThisSubLoopUsd) {
                // Let's break the loop because we can pay all the 
                // debt using just this token's supplied collateral
                break;
            }
        }
    } while (remainingDebtToRepayUsd > 0);

    return updatedBalances;
}