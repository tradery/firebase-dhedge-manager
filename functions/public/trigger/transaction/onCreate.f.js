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
        timeoutSeconds: 400,
        memory: "1GB",
        secrets: [
            "POLYGONSCAN_API_KEY",
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

            const message = 'Transaction failed while trying to ' + transactionDoc.data()._method
                + ' ' + transactionDoc.data().amount.balanceDecimal
                + ' ' + dhedge.addressToSymbol(transactionDoc.data().tokenFrom.address)
                + ' using ' + transactionDoc.data().dapp
                + ' within the pool: ' + portfolioDoc.data().fundName
                + '.'
            throw new Error(message);
        }
    });