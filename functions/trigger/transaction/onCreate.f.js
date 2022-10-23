const functions = require('firebase-functions');
const { firestore } = require('firebase-admin');

/**
 * Run when a new transaction is logged in the db
 */
exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process every market
        timeoutSeconds: 60,
        memory: "1GB",
    })
    .firestore
    .document('portfolios/{portfolioId}/transactions/{transactionId}')
    .onCreate(async (change, context) => {
        const { portfolioId, transactionId } = context.params;

        // Connect to Firestore
        const db = firestore();

        // Update the time
        const transactionRef = db.collection('portfolios').doc(portfolioId).collection('signals').doc(transactionId);
        
        // Update the db
        await transactionRef.set({
            createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        
    });