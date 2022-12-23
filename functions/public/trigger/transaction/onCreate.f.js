const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');
const helpers = require('./../../../libs/helpers');
const polygonscan = require('./../../../libs/polygonscan');
const dhedge = require('./../../../libs/dhedge');

/**
 * Run when a new transaction is created
 */
exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process every market
        timeoutSeconds: 540,
        memory: "1GB",
        secrets: [
            "POLYGONSCAN_API_KEY",
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "TWILIO_FROM_NUMBER",
            "TWILIO_TO_NUMBER",
        ],
    })
    .firestore
    .document('portfolios/{portfolioId}/transactions/{transactionId}')
    .onCreate(async (change, context) => {
        const { portfolioId, transactionId } = context.params;

        // Connect to Firestore
        const db = firestore();

        const portfoliosRef = db.collection('portfolios');
        const portfolioRef = portfoliosRef.doc(portfolioId);
        const transactionsRef = portfolioRef.collection('transactions');
        const transactionRef = transactionsRef.doc(transactionId);
        const transactionDoc = await transactionRef.get();

        // Get the transaction hash
        const txHash = transactionDoc.data().rawTransaction.hash;

        // Pause to allow for blocks to be written
        await helpers.delay(30);

        const isSuccessful = await polygonscan.isTransactionSuccessful(txHash);

        await transactionRef.set({
            _status: (isSuccessful === true) ? 'success' : 'fail'
        }, { merge: true });

        if (isSuccessful !== true) {
            const portfolioDoc = await portfolioRef.get();

            const message = 'Transaction ID ' + transactionId
                + ' failed while trying to ' + transactionDoc.data()._method
                + ' ' + transactionDoc.data().amount.balanceDecimal
                + ' ' + dhedge.addressToSymbol(transactionDoc.data().tokenFrom.address)
                + ' using ' + transactionDoc.data().dapp
                + ' within the pool: ' + portfolioDoc.data().fundName
                + ' (' + portfolioDoc.data().modelName + ')'
                + '. For more details see: ' + transactionDoc.data()._url
                + ' p.s. Consider approving spending again if this pool continues to fail.'

            // Send an SMS to note that there is an issue
            const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            await client.messages
                .create({
                    body: message, 
                    from: process.env.TWILIO_FROM_NUMBER, 
                    to: process.env.TWILIO_TO_NUMBER
            });
            throw new Error(message);
        }
    });