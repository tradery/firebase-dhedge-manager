const fetch = require('node-fetch');
const basepath = 'https://api.polygonscan.com/api';
const helpers = require('./helpers');

/**
 * Get the status of a transaction
 * 
 * @param {String} txHash A transaction hash
 * @returns {Boolean} True if succesful; false if failed
 */
 exports.isTransactionSuccessful = async (txHash) => {
    
    let status = null;
    let counter = 0;

    do {
        const response = await fetch(basepath
            + '?module=transaction'
            + '&action=gettxreceiptstatus'
            + '&txhash=' + txHash
            + '&apikey=' + process.env.POLYGONSCAN_API_KEY,
            {
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'deflate, gzip'
                },
            }
        );

        const responseJson = await response.json();
        const txStatus = responseJson.result.status;

        if (txStatus === "0") {
            status = false;

        } else if (txStatus === "1") {
            status = true;

        } else {
            // Try again in a few seconds
            helpers.log("Transaction pending... trying again soon...");
            await helpers.delay(30);
            counter++;
        }

    } while (status === null && counter < 4);
    
    return status
}
