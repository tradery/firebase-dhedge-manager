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
        'supply': [],
        'variable-debt': []
    };
    
    if (assets.length === 0) {
        return response;
    }

    let supplyBalanceUsd = debtBalanceUsd = supplyLiquidationThreshold = 0;
    for (const asset of assets) {
        const groupId = asset.groupId;
        response[groupId].push({
            'symbol': asset.tokens[0].symbol, 
            'address': asset.tokens[0].address,
            'decimals': asset.tokens[0].decimals,
            'usdPrice': asset.tokens[0].price,
            'balanceDecimal': asset.tokens[0].balance,
            'balanceInt': Number(asset.tokens[0].balanceRaw),
            'balanceUsd': asset.tokens[0].balanceUSD,
            'balanceBn': ethers.BigNumber.from(asset.tokens[0].balanceRaw),
            'liquidationThreshold': asset.dataProps.liquidationThreshold,
        });

        if (groupId === 'supply') {
            supplyBalanceUsd += asset.tokens[0].balanceUSD;
        } else if (groupId === 'variable-debt') {
            debtBalanceUsd += asset.tokens[0].balanceUSD;
        }
    }

    // Calculate the liquidation threshold, potentially for multiple tokens
    for (const asset of response['supply']) {
        supplyLiquidationThreshold += (asset.balanceUsd / supplyBalanceUsd) * asset.liquidationThreshold;
    }
    response['liquidationThreshold'] = supplyLiquidationThreshold;
    response['supplyBalanceUsd'] = supplyBalanceUsd;
    response['debtBalanceUsd'] = debtBalanceUsd;
    
    // And finally the liquidation health
    const liquidationHealth = supplyLiquidationThreshold / (debtBalanceUsd / supplyBalanceUsd);
    response['liquidationHealth'] = (isFinite(liquidationHealth)) ? liquidationHealth : null;
    return response;
}

// EXAMPLE RESPONSE
//
//  {
//    supply: [
//      {
//        symbol: 'USDC',
//        address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
//        decimals: 6,
//        usdPrice: 1,
//        balanceDecimal: 1.000032,
//        balanceInt: '1000032',
//        balanceUsd: 1.000032,
//        balanceBn: BigNumber { _hex: '0x0f4260', _isBigNumber: true },
//        liquidationThreshold: 0.85
//      },
//      {
//        symbol: 'WBTC',
//        address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
//        decimals: 8,
//        usdPrice: 19173.32,
//        balanceDecimal: 0.00023064,
//        balanceInt: '23064',
//        balanceUsd: 4.4221345248,
//        balanceBn: BigNumber { _hex: '0x5a18', _isBigNumber: true },
//        liquidationThreshold: 0.75
//      }
//    ],
//    'variable-debt': [
//      {
//        symbol: 'USDC',
//        address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
//        decimals: 6,
//        usdPrice: 1,
//        balanceDecimal: 1.000062,
//        balanceInt: '1000062',
//        balanceUsd: 1.000062,
//        balanceBn: BigNumber { _hex: '0x0f427e', _isBigNumber: true },
//        liquidationThreshold: 0.85
//      }
//    ],
//    liquidationThreshold: 0.7684434025665946,
//    supplyBalanceUsd: 5.4221665248,
//    debtBalanceUsd: 1.000062,
//    liquidationHealth: 4.1663697786737215
//  }
//
//
//
//  {
//    supply: [
//      {
//        symbol: 'USDC',
//        address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
//        decimals: 6,
//        usdPrice: 1,
//        balanceDecimal: 5.000957,
//        balanceInt: '5000957',
//        balanceUsd: 5.000957,
//        balanceBn: BigNumber { _hex: '0x4c4efd', _isBigNumber: true },
//        liquidationThreshold: 0.85
//      }
//    ],
//    liquidationThreshold: 0.85,
//    supplyBalanceUsd: 5.000957,
//    debtBalanceUsd: 0,
//    liquidationHealth: null
//  }