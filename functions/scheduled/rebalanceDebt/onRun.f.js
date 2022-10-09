const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const FieldValue = firestore.FieldValue;
const helpers = require('../../libs/helpers');
const btcSuperYield = require('../../libs/strategies/btcSuperYield');
const dhedge = require('../../libs/dhedge');
const coinmarketcap = require('../../libs/coinmarketcap');
const { ethers } = require("@dhedge/v2-sdk");
const delay = require('delay');
const zapper = require('../../libs/zapper');

/**
 * Rebalance Portfolio Debt
 * 
 * Runs through each porfolio we manage and runs a debt rebalacing strategy
 * to prevent liquidations and maximize leverage.
 */
 exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process
        timeoutSeconds: 120,
        memory: "1GB",
    })
    .pubsub
    .schedule('every 5 minutes')
    .onRun(async (context) => {
        try {
            // Initialize Firebase components
            const db = firestore();

            // Define db constants
            const tweetsRef = db.collection('tweets');
            
            // Get our tweets index doc
            const tweetsIndexRef = tweetsRef.doc('index');
            const tweetsIndexDoc = await tweetsIndexRef.get();
            let tweetGuids = [];

            // Is this the first run?
            if (tweetsIndexDoc.exists) {

            }

            console.log(db);

            return null;
        } catch (err) {
            functions.logger.error(err, { structuredData: true });
            return null;
        }
    });