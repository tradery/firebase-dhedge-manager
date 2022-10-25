const { firestore } = require('firebase-admin');
const fetch = require('node-fetch');
const helpers = require('./helpers');
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
 * Get token price
 * 
 * @parap   {Integer} The CoinMarketCap token ID
 * @returns {Float} Just the token price
 */
 exports.getUsdPrice = async (id) => {
    if (id === null) {
        return null;
    }

    // Initialize Firebase components
    const db = firestore();

    // Get the latest price from the db
    const pricesRef = db.collection('tokenPrices');
    const pricesSnapshot = await pricesRef.where('coinMarketCapId', '==', id).orderBy('createdAt', 'desc').limit(1).get();

    // Calculate the timestamp
    const now = new Date();
    const utcMilllisecondsSinceEpoch = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const utcSecondsSinceEpoch = Math.round(utcMilllisecondsSinceEpoch / 1000);
    const timestamp = new firestore.Timestamp(utcSecondsSinceEpoch, 0);

    let price = timeDiff = null;
    if (helpers.snapshotToArray(pricesSnapshot)[0] !== undefined) {
        const lastPrice = helpers.snapshotToArray(pricesSnapshot)[0].data;
        const then = lastPrice.createdAt;
        timeDiff = Math.floor((timestamp - then) / 60);
        price = lastPrice.price;
    }

    if (price === null || timeDiff > 0) {
        const quoteData = await _this.quotes(id);
        price = (quoteData === undefined) ? null : quoteData[id]['quote']['USD']['price'];
        
        // Save the new price info
        await pricesRef.doc().set({
            createdAt: timestamp
            , coinMarketCapId: id
            , priceUsd: price
            , symbol: quoteData[id]['symbol']
        });
    }
    
    return price;
}