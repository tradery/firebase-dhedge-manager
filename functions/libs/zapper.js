const fetch = require('node-fetch');
const { ethers } = require("@dhedge/v2-sdk");
const basepath = 'https://api.zapper.fi/v2/';

/**
 * Get AAVE V2 Portfolio Balances
 * 
 * @param {String} addess A wallet address
 * @param {String} network A valid blockchain network. Default is 'polygon'
 * @returns {Array} An array of positions
 */
 exports.aaveBalances = async (address, network = 'polygon') => {
    // Get the AAVE v2 portfolio for a wallet address
    address = address.toLowerCase();
    const response = await fetch(basepath
        + 'apps/aave-v2/balances'
        + '?addresses[]=' + address
        + '&network=' + network,
        {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'deflate, gzip',
                'Authorization': 'Basic ' + Buffer.from(process.env.ZAPPER_API_KEY + ":").toString('base64')
            },
        }
    );

    if (response.status === 400) {
        throw new Error(JSON.stringify(await response.json()));
    }
    const responseJson = await response.json();
    if (responseJson.balances[address].products.length === 0) {
        return [];
    }

    // No errors
    const assets = responseJson.balances[address].products[0].assets;
    return assets;
}

/**
 * Get Clean AAVE Balances
 * 
 * @TODO Support more groupIds than just 'supply' and 'variable-debt'
 * 
 * @param {Array} assets List of AAVE assets from aaveBalances()
 * @returns {Object} A clean list of relevant data
 */
exports.cleanAaveBalances = (assets) => {
    let response = {
        'supply': {},
        'variable-debt': {},
        'supplyBalanceUsd': 0,
        'debtBalanceUsd': 0,
        'liquidationThreshold': 0,
        'liquidationHealth': null,
    };
    
    if (assets.length === 0) {
        return response;
    }

    let supplyBalanceUsd = debtBalanceUsd = supplyLiquidationThreshold = 0;
    for (const asset of assets) {
        const groupId = asset.groupId;
        const token = {
            'symbol': asset.tokens[0].symbol, 
            'address': asset.tokens[0].address,
            'decimals': asset.tokens[0].decimals,
            'usdPrice': asset.tokens[0].price,
            'balanceDecimal': asset.tokens[0].balance,
            'balanceInt': Number(asset.tokens[0].balanceRaw),
            'balanceUsd': asset.tokens[0].balanceUSD,
            'balanceBn': ethers.BigNumber.from(asset.tokens[0].balanceRaw),
            'liquidationThreshold': asset.dataProps.liquidationThreshold,
        };
        response[groupId][token.symbol] = token;

        if (groupId === 'supply') {
            supplyBalanceUsd += asset.tokens[0].balanceUSD;
        } else if (groupId === 'variable-debt') {
            debtBalanceUsd += asset.tokens[0].balanceUSD;
        }
    }

    // Calculate the liquidation threshold, potentially for multiple tokens
    for (const asset in response['supply']) {
        const token = response['supply'][asset];
        supplyLiquidationThreshold += (token.balanceUsd / supplyBalanceUsd) * token.liquidationThreshold;
    }
    response['liquidationThreshold'] = supplyLiquidationThreshold;
    response['supplyBalanceUsd'] = supplyBalanceUsd;
    response['debtBalanceUsd'] = debtBalanceUsd;

    const leverage = supplyBalanceUsd / (supplyBalanceUsd - debtBalanceUsd);
    response['leverage'] = (isFinite(leverage)) ? leverage : 0;
    
    // And finally the liquidation health
    const liquidationHealth = supplyLiquidationThreshold / (debtBalanceUsd / supplyBalanceUsd);
    response['liquidationHealth'] = (isFinite(liquidationHealth)) ? liquidationHealth : null;
    return response;
}
