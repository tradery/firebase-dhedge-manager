const { FeeAmount } = require("@uniswap/v3-sdk");
const coinmarketcap = require('../coinmarketcap');
const dhedge = require('../dhedge');

exports.long = async () => {
    // Move all assets to BTC and crank the leverage with AAVE


    return await dhedge.getComposition();
}

exports.short = async () => {
    // Move all assets to USDC and crank the leverage with AAVE
    return await dhedge.getComposition();
}


// TODO: Setup exports.closeLong() and exports.closeShort()
// so that we know if we are repaying AAVE debt in WBTC or USDC
// make sure we account for unknown deposits of other currencies 
// Make sure to account for asset.isDeposit === false to know if it is lending or borrowing

exports.neutral = async () => {
    // Move all assets to USDC with UniswapV3
    const pool = await dhedge.initPool();
    const assets = await dhedge.getComposition();
    const feeAmount = FeeAmount.LOW;
    const slippageTolerance = 1;

    for (const asset of assets) {
        if (asset.asset !== dhedge.tokens.USDC) {
            if (asset.balance._hex != '0x00') {
                const tx = await pool.tradeUniswapV3(
                    asset.asset,
                    dhedge.tokens.USDC,
                    asset.balance._hex,
                    feeAmount,
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