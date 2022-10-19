const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const fetch = require('node-fetch');
const helpers = require('../../libs/helpers');

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
        secrets: [
            "API_KEY", 
            "LOCAL_BASEPATH",
            "PRODUCTION_BASEPATH", 
        ],
    })
    .pubsub
    .schedule('every 5 minutes')
    .onRun(async (context) => {
        try {
            // Make sure our ENVs are set
            if (helpers.getBasepath() === undefined || helpers.getBasepath() === '')
                throw new Error("LOCAL_BASEPATH &/OR PRODUCTION_BASEPATH is not defined on the server.");
            if (process.env.API_KEY === undefined || process.env.API_KEY === '')
                throw new Error("API_KEY is not defined on the server.");

            // Initialize Firebase components
            const db = firestore();

            // Define db constants
            const portfoliosRef = db.collection('portfolios');
            const snapshot = await portfoliosRef.where('isActive', '==', true).get();
            const portfolios = helpers.snapshotToArray(snapshot);
            
            // For every active portfolio
            for (const portfolio of portfolios) {

                // Rebalance the pool and debt in a new thread
                // We're purposely not calling this with await
                // because we don't want this script to hang. 
                fetch(helpers.getBasepath()
                    + 'publicRebalanceOnRequest',
                    {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Accept-Encoding': 'deflate, gzip',
                            'authorization': process.env.API_KEY
                        },
                        body: JSON.stringify({ 'secret': portfolio.id })
                    }
                );
            }

            return null;
        } catch (err) {
            functions.logger.error(err, { structuredData: true });
            return null;
        }
    });