const fetch = require('node-fetch');
const basepath = 'https://pro-api.coinmarketcap.com/v2/';
const _this = this;

/**
 * Get price quotes
 * 
 * @param {String} currencies An CSV of coinmarketcap IDs. e.g. '1,1027'
 * @returns {Object} A JSON list of currency quotes
 */
 exports.quotes = async (currencies) => {
    // Get the latest price for a list of currencies
    const response = await fetch(basepath
        + 'cryptocurrency/quotes/latest'
        + '?id=' + currencies,
        {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'deflate, gzip',
                'X-CMC_PRO_API_KEY': process.env.COIN_MARKET_CAP_API_KEY
            },
        }
    );

    const responseJson = await response.json();
    return responseJson.data;
}

/**
 * Get list of coinmarketcap token ids
 * 
 * @returns {Object} A JSON list of tokens
 */
exports.currencyCodes = async () => {
    const response = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/map',
        {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'deflate, gzip',
                'X-CMC_PRO_API_KEY': process.env.COIN_MARKET_CAP_API_KEY
            },
        }
    );

    const responseJson = await response.json();
    return responseJson.data;
}

/**
 * Get the latest price of Bitcoin 
 * 
 * @returns {Float} The current price of Bitcon 
 */
exports.btcPrice = async () => {
    const id = 1;
    const data = await _this.quotes(id);
    return data[id]['quote']['USD']['price'];
}

/**
 * Get the latest price of Ethereum 
 * 
 * @returns {Float} The current price of Ethereum 
 */
exports.ethPrice = async () => {
    const id = 1027;
    const data = await _this.quotes(id);
    return data[id]['quote']['USD']['price'];
}

/**
 * Get the latest price of Matic 
 * 
 * @returns {Float} The current price of Matic 
 */
exports.maticPrice = async () => {
    const id = 3890;
    const data = await _this.quotes(id);
    return data[id]['quote']['USD']['price'];
}

/**
 * Get token price
 * 
 * @parap   {Integer} The CoinMarketCap token ID
 * @returns {Float} Just the token price
 */
 exports.getUsdPrice = async (id) => {
    if (id === null) {
        return null;
    }
    const data = await _this.quotes(id);
    return (data === undefined) ? null : data[id]['quote']['USD']['price'];
}