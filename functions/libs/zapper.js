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

    if (response.status == 400) {
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
 * @TODO Support more than one token for 'supply' and 'variable-debt'
 * @TODO Support more groupIds than just 'supply' and 'variable-debt'
 * 
 * @param {Array} assets List of AAVE assets from aaveBalances()
 * @returns {Object} A clean list of relevant data
 */
exports.cleanAaveBalances = (assets) => {
    let response = {};
    let supplyBalance, debtBalance, supplyLiquidationThreshold = 0;
    for (const asset of assets) {
        response[asset.groupId] = {
            'symbol': asset.tokens[0].symbol, 
            'address': asset.tokens[0].address,
            'decimals': asset.tokens[0].decimals,
            'usdPrice': asset.tokens[0].price,
            'balance': asset.tokens[0].balance,
            'balanceRaw': asset.tokens[0].balanceRaw,
            'balanceUSD': asset.tokens[0].balanceUSD,
            'balanceBN': ethers.BigNumber.from(asset.tokens[0].balanceRaw),
            'liquidationThreshold': asset.dataProps.liquidationThreshold,
        }
        if (asset.groupId === 'supply') {
            supplyLiquidationThreshold = asset.dataProps.liquidationThreshold;
            supplyBalance = asset.tokens[0].balanceUSD;
        } else if (asset.groupId === 'variable-debt') {
            debtBalance = asset.tokens[0].balanceUSD;
        }
    }
    response['liquidationHealth'] = supplyLiquidationThreshold / (debtBalance / supplyBalance);
    return response;
}

// EXAMPLE RESPONSE
//
// {
//     supply: {
//       symbol: 'WBTC',
//       address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
//       decimals: 8,
//       usdPrice: 20157,
//       balance: 0.00096227,
//       balanceRaw: '96227',
//       balanceUSD: 19.39647639,
//       balanceBN: BigNumber { _hex: '0x0177e3', _isBigNumber: true },
//       liquidationThreshold: 0.75
//     },
//     'variable-debt': {
//       symbol: 'USDC',
//       address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
//       decimals: 6,
//       usdPrice: 1,
//       balance: 11.204611,
//       balanceRaw: '11204611',
//       balanceUSD: 11.204611,
//       balanceBN: BigNumber { _hex: '0xaaf803', _isBigNumber: true },
//       liquidationThreshold: 0.85
//     },
//     health: 1.2983366662617737
//   }