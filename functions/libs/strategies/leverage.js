const { ethers } = require("@dhedge/v2-sdk");
const delay = require('delay');
const coinmarketcap = require('../coinmarketcap');
const dhedge = require('../dhedge');
const aave = require('../aave');
const helpers = require('../helpers');
const _this = this;
const delayAmount = 5000;

/**
 * @TODO Support multiple models and tokens
 */


exports.long = async (
    bullTokenAddress = dhedge.tokens.WBTC.address,
    bearTokenAddress = dhedge.tokens.USDC.address,
) => {
    // Initialize and check balances
    const pool = await dhedge.initPool();
    const poolInfo = await pool.getComposition();
    helpers.log(poolInfo);

    // Take note of any existing tokens
    const bullTokenBalance = dhedge.getBalance(poolInfo, bullTokenAddress);

    // Do we have any of the bear token (typically USDC)?
    const bearTokenBalance = dhedge.getBalance(poolInfo, bearTokenAddress);
    if (bearTokenBalance.gt(0)) {
        const bearBalanceDetails = dhedge.getBalanceInfo(bearTokenBalance);
        const bearUsdPrice = coinmarketcap.getUsdPrice(dhedge.tokens.)
        helpers.log(
            'Swapping ' + balanceDetails.decimal + ' '
            + dhedge.addressToSymbol(bearTokenAddress) + ' '
            + '($' + debtToRepayThisLoopUsd + ') '
            + 'for ' + cleanBalances['variable-debt'].symbol + ' '
            + 'on Uniswap'
        );
        const tx = await dhedge.tradeUniswap(
            dhedge.tokens.USDC,
            dhedge.tokens.WBTC,
            amount
        );
        const wbtcAmount = await _this.usdcToBtc(amount)
        helpers.log('Swapped '
             + _this.usdcHexToDecimal(amount)
             + ' USDC into approximately ' 
             + _this.btcHexToDecimal(wbtcAmount) 
             + ' WBTC');

        
        await _this.swapUsdcForBtc(usdcBalance);
    }

    // Add any existing WBTC to any new WBTC coming from a recent USDC swap
    const newWbtcBalance = wbtcBalance.add(await _this.usdcToBtc(usdcBalance));
    if (newWbtcBalance.gt(0)) {
        helpers.log(newWbtcBalance);
        helpers.log('New WBTC balance is approximately ' + _this.btcHexToDecimal(newWbtcBalance));
        await _this.lendWbtc(newWbtcBalance);
    }
    
    const newUsdcBalance = await _this.borrowUsdc(newWbtcBalance);

    const newerBtcBalance = await _this.swapUsdcForBtc(newUsdcBalance);
    await _this.lendWbtc(newerBtcBalance);

    const newerUsdcBalnce = await _this.borrowUsdc(newerBtcBalance);
    helpers.log('New USDC balance is approximately ' + _this.usdcHexToDecimal(newerUsdcBalnce));

    const newestBtcBalance = await _this.swapUsdcForBtc(newerUsdcBalnce);
    await _this.lendWbtc(newestBtcBalance);

    return true;
}



/**
 * Convert USDC BigNumber to BTC BigNumber
 * 
 * @param {BigNumber} amount USDC formatted as a ethers.BigNumber
 * @returns {BigNumber} The amount of converted BTC, less 1%
 */
exports.usdcToBtc = async (amount) => {
    amount = ethers.BigNumber.from(amount);
    if (amount.lte(0)) {
        return amount;
    }

    // What's the current price of BTC?
    const btcPrice = await coinmarketcap.btcPrice();

    // Divide the USDC amount by the current price of Bitcoin
    const usdcDecimal = _this.usdcHexToDecimal(amount);
    const btcDecimal = (usdcDecimal / btcPrice) * .99;

    // Do hacky string conversion to get the number to the right length
    const parts = btcDecimal.toString().split('.');
    const decimals = parts[1].substring(0,7);
    const allParts = parts[0] + '.' + decimals;
    
    helpers.log(usdcDecimal + ' USDC is approximately equal to ' + allParts + ' BTC');

    // BigNumber formatted for BTC
    return ethers.utils.parseUnits(allParts, 8);
}

/**
 * Convert BTC BigNumber to USDC BigNumber
 * 
 * @param {BigNumber} amount BTC formatted as a ethers.BigNumber
 * @returns {BigNumber} The amount of converted USDC, less 1%
 */
 exports.btcToUsdc = async (amount) => {
    amount = ethers.BigNumber.from(amount);
    if (amount.lte(0)) {
        return amount;
    }

    // What's the current price of BTC?
    const btcPrice = await coinmarketcap.btcPrice();

    // Multiply the BTC price by the amount of Bitcoin
    const btcDecimal = _this.btcHexToDecimal(amount);
    const usdcDecimal = btcDecimal * btcPrice * .99

    // Do hacky string conversion to get the number to the right length
    const parts = usdcDecimal.toString().split('.');
    const decimals = parts[1].substring(0,5);
    const allParts = parts[0] + '.' + decimals;

    helpers.log(btcDecimal + ' BTC is approximately equal to ' + allParts + ' USDC');
    
    // BigNumber formatted for USDC
    return ethers.utils.parseUnits(allParts, 6);
}

/**
 * BTC to Decimal
 * 
 * @param {BigNumber} amount The amount of tokens as a hex value
 * @returns {String} The amount of tokens as a decimal string
 */
exports.btcHexToDecimal = (amount) => {
    return ethers.utils.formatUnits(amount, 8); 
}

/**
 * USDC to Decimal
 * 
 * @param {BigNumber} amount The amount of tokens as a hex value
 * @returns {String} The amount of tokens as a decimal string
 */
 exports.usdcHexToDecimal = (amount) => {
    return ethers.utils.formatUnits(amount, 6); 
}

/**
 * Safely Half a BigNumber
 * 
 * @param {BigNumber} amount The starting number as a hex
 * @returns {BigNumber} Half the starting amount, as a hex
 */
exports.halfBn = (amount) => {
    amount = ethers.BigNumber.from(amount);
    if (amount.lte(0)) {
        return amount;
    }

    return amount.div(2);
}

/**
 * Swap USDC for BTC
 * 
 * @param {BigNumber} amount Amount of USDC to swap for WBTC, as a hex
 * @returns {BigNumber} Expected amount of BTC to get back, as a hex
 */
exports.swapUsdcForBtc = async (amount) => {
    // Swap the USDC for WBTC
    const tx = await dhedge.tradeUniswap(
        dhedge.tokens.USDC,
        dhedge.tokens.WBTC,
        amount
    );
    const wbtcAmount = await _this.usdcToBtc(amount)
    helpers.log('Swapped '
         + _this.usdcHexToDecimal(amount)
         + ' USDC into approximately ' 
         + _this.btcHexToDecimal(wbtcAmount) 
         + ' WBTC');
    // helpers.log(tx);

    helpers.log('   ...Pausing for ' + delayAmount / 1000 + ' seconds...');
    await delay(delayAmount);

    return wbtcAmount;
}

/**
 * Lend WBTC to AAVE
 * 
 * @param {BigNumber} amount Amount of BTC to deposit, as a hex
 * @returns {Object} Transaction details
 */
exports.lendWbtc = async (amount) => {
    const tx = await dhedge.lendDeposit(dhedge.tokens.WBTC, amount);
    helpers.log('Depositing ' + _this.btcHexToDecimal(amount) + ' WBTC into AAVE');

    helpers.log('   ...Pausing for ' + delayAmount / 1000 + ' seconds...');
    await delay(delayAmount);

    return tx;
}

/**
 * Borrow USDC from AAVE
 * 
 * @param {BigNumber} amount Amount of WBTC deposited in AAVE
 * @returns {BigNumber} Amount of USDC to borrow, as a hex
 */
exports.borrowUsdc = async (amount) => {
    const half = _this.halfBn(amount);
    const usdcToBorrow = await _this.btcToUsdc(half);
    const tx = await dhedge.borrowDebt(dhedge.tokens.USDC, usdcToBorrow);
    helpers.log('Borrowing '
         + _this.usdcHexToDecimal(usdcToBorrow)
         + ' USDC (' 
         + ethers.utils.parseUnits(_this.usdcHexToDecimal(usdcToBorrow), 6)
         + ') from AAVE');

         helpers.log('   ...Pausing for ' + delayAmount / 1000 + ' seconds...');
         await delay(delayAmount);

    return usdcToBorrow;
}



exports.short = async () => {
    // Move all assets to USDC and crank the leverage with AAVE
    return await dhedge.getComposition();
}


// TODO: Setup exports.closeLong() and exports.closeShort()
// so that we know if we are repaying AAVE debt in WBTC or USDC
// make sure we account for unknown deposits of other currencies 
// Make sure to account for asset.isDeposit === false to know if it is lending or borrowing
// Switch to uniswap v2 by adding a trade function to dhedge lib


// if i have an open position with aave then my borrowed assets must be wbtc or usdc
// if i'm closing a long that means that my borroweed assets are usdc. i can repay with wbtc
// if i'm closing a short that means that my borrowed assets are wbtc. i can repy with usdc

// to close a long
// 


exports.neutral = async () => {
    // Move all assets to USDC with UniswapV3
    const pool = await dhedge.initPool();
    const assets = await pool.getComposition();
    const slippageTolerance = 1;

    for (const asset of assets) {
        if (asset.asset !== dhedge.tokens.USDC) {
            if (asset.balance.isZero() == false) {
                // replace with dhedge.trade()
                const tx = await pool.tradeUniswapV3(
                    asset.asset,
                    dhedge.tokens.USDC,
                    asset.balance._hex,
                    slippageTolerance,
                    dhedge.gasInfo()
                );

                helpers.log('Exiting ' + asset.asset);
                helpers.log(tx);
            }
        }
    }

    return await dhedge.getComposition();
}