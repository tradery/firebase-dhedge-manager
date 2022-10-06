const fetch = require('node-fetch');
const basepath = 'https://api.zapper.fi/v2/';

/**
 * Get AAVE V2 Portfolio Balances
 * 
 * @param {String} currencies An CSV of coinmarketcap IDs. e.g. '1,1027'
 * @returns {Object} A JSON list of currency quotes
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

    const responseJson = await response.json();
    return (responseJson.balances[address].products.length !== 0) ?
        responseJson.balances[address].products[0].assets : null;
}
