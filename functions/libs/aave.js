const { ethers } = require("@dhedge/v2-sdk");
const zapper = require('./zapper');
const helpers = require('./helpers');
const dhedge = require('./dhedge');
const _this = this;

exports.liquidationHealthTarget = 1.5;

exports.rebalanceDebt = async () => {
    const zapperResponse = await zapper.aaveBalances(process.env.POOL_ADDRESS);
    // helpers.log(zapperResponse);
    const aaveBalances = zapper.cleanAaveBalances(zapperResponse);
    helpers.log(aaveBalances);
    
    // Unwind some debt
    return await _this.reduceDebt(aaveBalances, _this.liquidationHealthTarget);
}

exports.emptyDebt = async () => {
    const aaveBalances = zapper.cleanAaveBalances(await zapper.aaveBalances(process.env.POOL_ADDRESS));
    helpers.log(aaveBalances);
    
    // Unwind some debt
    return await _this.reduceDebt(aaveBalances);
}

exports.getTargetWithdrawAmount = (supply, debt, liquidationThreshold, liquidationHealthTarget) => {
    const debtratio = debt / supply;
    const targetLiquidationThreshold = liquidationThreshold / liquidationHealthTarget;
    const offsetRatio = (debtratio / targetLiquidationThreshold) - 1;
    const offset = supply * offsetRatio;
    return offset;
}

exports.borrow2xLeverage = async () => {
    //
}

exports.reduceDebt = async (cleanBalances, liquidationHealthTarget = null) => {
    // The Liquidation Threshold is a constant related to the supply token
    const liquidationThreshold = cleanBalances['supply'].liquidationThreshold;
    const supplyTokenAddress = cleanBalances['supply'].address;
    const debtTokenAddress = cleanBalances['variable-debt'].address;
    
    // By default, let's plan to repay all the debt
    let remainingDebtToRepay = cleanBalances['variable-debt'].balanceUSD;
    
    // Setup our current values
    let currentSupply = cleanBalances['supply'].balanceUSD;
    let currentDebt = cleanBalances['variable-debt'].balanceUSD;
    let currentHealth = cleanBalances.liquidationHealth;

    // Loop as many times as needed to reduce all the debt
    do {
        // Check to see if we can safely exit this method because our debt ratio 
        // is already above the specified liquidation health target
        if (liquidationHealthTarget !== null
            && currentHealth > liquidationHealthTarget) {
                return true;
        }

        if (liquidationHealthTarget !== null) {
            // We're not repaying all debt... just some of it
            // Here we figure out how much we'd like to pay down
            remainingDebtToRepay = _this.getTargetWithdrawAmount(
                currentSupply, 
                currentDebt, 
                liquidationThreshold, 
                liquidationHealthTarget,
            );
        }

        // Determine how much supply we can safely use to pay down debt
        const safeSupplyWithdrawMultiple = currentHealth - 1.05
        const maxSafeSupplyToWithdraw = currentSupply * safeSupplyWithdrawMultiple;
        
        // Try to repay as much debt as possible per loop        
        let debtToRepayThisLoopUsd = (remainingDebtToRepay > maxSafeSupplyToWithdraw) ? 
            maxSafeSupplyToWithdraw :
            remainingDebtToRepay;

        // Calculate the repayment values as an integers so ethers can understand the values
        const debtToRepayDecimal = debtToRepayThisLoopUsd / cleanBalances['supply'].usdPrice;
        const debtToRepayInteger = dhedge.decimalToInteger(debtToRepayDecimal, cleanBalances['supply'].decimals);
        const estimatedSwapDecimal = 0.99 * (debtToRepayThisLoopUsd / cleanBalances['variable-debt'].usdPrice);
        const estimatedSwapInteger = dhedge.decimalToInteger(estimatedSwapDecimal, cleanBalances['variable-debt'].decimals);


        /**
         * @TODO Check to see if we have any balance in our wallet
         * getComposition()
         * 
         * pay off as much balance as we can with debt token
         * 
         * @TODO
         * support multiple tokens in supply or variable-debt
         * 
         * @TODO
         * handle negative numbers if liquidation health is below 1
         */


        // Withdraw supply tokens
        helpers.log(
            'Withdrawing ' + debtToRepayDecimal + ' '
            + cleanBalances['supply'].symbol + ' '
            + '($' + debtToRepayThisLoopUsd + ') '
            + 'from AAVE'
        );
        await dhedge.withdrawDeposit(
            supplyTokenAddress,
            debtToRepayInteger
        );
        await helpers.delay();

        // Swap to debt tokens
        helpers.log(
            'Swapping ' + debtToRepayDecimal + ' '
            + cleanBalances['supply'].symbol + ' '
            + '($' + debtToRepayThisLoopUsd + ') '
            + 'for ' + cleanBalances['variable-debt'].symbol + ' '
            + 'on Uniswap'
        );
        await dhedge.tradeUniswap(
            supplyTokenAddress,
            debtTokenAddress,
            debtToRepayInteger
        );
        await helpers.delay();
        
        // // Deposit debt tokens as new supply
        // helpers.log(
        //     'Depositing approximately ' + estimatedSwapDecimal + ' '
        //     + cleanBalances['variable-debt'].symbol + ' '
        //     + '($' + (.99 * debtToRepayThisLoopUsd) + ') '
        //     + 'into AAVE'
        // );
        // await dhedge.lendDeposit(
        //     debtTokenAddress,
        //     estimatedSwapInteger
        // );
        // await helpers.delay(10000);

        // Repay debt
        helpers.log(
            'Repaying approximately ' + estimatedSwapDecimal + ' '
            + cleanBalances['variable-debt'].symbol + ' '
            + '($' + (0.99 * debtToRepayThisLoopUsd) + ') '
            + 'on AAVE'
        );
        await dhedge.repayDebt(
            debtTokenAddress,
            estimatedSwapInteger
        );
        await helpers.delay();

        // Recalculate current supply, debt, health, and remaining debt to repay
        remainingDebtToRepay -= debtToRepayThisLoopUsd;
        currentSupply -= debtToRepayThisLoopUsd;
        currentDebt -= debtToRepayThisLoopUsd;
        currentHealth = liquidationThreshold / (currentDebt / currentSupply);

        // Debug info
        helpers.log({
            'remainingDebtToRepay': remainingDebtToRepay,
            'currentSupply': currentSupply,
            'currentDebt': currentDebt,
            'currentHealth': currentHealth,
        });
    } while (remainingDebtToRepay > 0);

    /**
     * @TODO withdraw remaining supply from AAVE
     */
    
    return true;
}