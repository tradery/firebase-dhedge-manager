# dHedge Manager for Firebase Functions
An API that allows data scientists to effortlessly send trading signals to the dHedge protocol.

## Getting Started

### 1. Configure Firebase
- Create a Google Firebase project
- Enable [Google Secrets](https://cloud.google.com/secret-manager) - [docs](https://firebase.google.com/docs/functions/config-env#managing_secrets)

### 2. Configure Your Environmental Variables
- CD into `./functions`
- Run `firebase functions:secrets:set API_KEY` to set the authorization header value needed to access the functions.
- Run `firebase functions:secrets:set MNEMONIC` to set the recovery phrase for your dhedge manager wallet.
- Run `firebase functions:secrets:set POOL_ADDRESS` to set the pool address that you wish to manage using the provided mnemonic.
- Run `firebase functions:secrets:set PROVIDER` to set the RPC provider and API key. e.g. https://polygon-mainnet.infura.io/v3/your-code-here
- Run `firebase functions:secrets:set COIN_MARKET_CAP_API_KEY` to set your CoinMarketCap API key. This enables price lookups. Note that you may want to use a paid key to prevent this from failing abruptly.
- Run `firebase functions:secrets:set ZAPPER_API_KEY` to set your Zapper API key. This enables AAVE portfolio lookups. Note that you may want to use a paid key to prevent this from failing abruptly.
- Run `firebase functions:secrets:set POLYGONSCAN_API_KEY` to set your PolygonScan API key. This allows us to check for failed transactions.
- Run `firebase functions:secrets:set LOCAL_BASEPATH` to set your local basepath for functions. This enables testing our pub/sub functions. e.g. `http://127.0.0.1:5002/[project-name]/us-central1/`
- Run `firebase functions:secrets:set PRODUCTION_BASEPATH` to set your basepath for functions. This enables our pub/sub functions. e.g. `https://us-central1-[project-name].cloudfunctions.net/`


### 4. Deploy the Functions to Production
- Run `firebase deploy` from the root directory of this project.

### 5. Approve Spending
- Hit the `publicApproveSpendingOnRequest` route once for your pool each time you change the approve pool assets.

### 6. Send Signals
- Send your signals to your endpoint.

## Notes on Functions
### Overview
- Functions are in the `./functions` folder
- Each function is nested into `./functions/{callType}/{descriptiveName}/onRequest.f.js`

### Local Development
- Run `npm install` from `./functions`
- Emulate Firebase Functions locally by running `firebase emulators:start` from the `functions` directory of this project.
- Test scheduled functions with `firebase functions:shell`. Call the function by name from within the shell. [Learn more](https://stackoverflow.com/a/69424195/17273215)
- Sometimes emulators don't close their ports properly. Try this on Mac (of course updating it to match the port that was mistakenly left open) `lsof -t -i tcp:5002 | xargs kill`

## Notes on Firestore
### Local Development
- To export local data from your local instance of Firestore `firebase emulators:export ./firebaseData`
- To import local data into Firestore for testing `firebase emulators:start --import=./firebaseData`
- To export local firestore data every time `firebase emulators:start --import=./firebaseData --export-on-exit`


## Helpful Links
- [Video on Firebase emulators](https://www.youtube.com/watch?v=pkgvFNPdiEs)
- [Google Developers API Console](https://console.developers.google.com/apis/dashboard)
- [dHedge SDK v2](https://github.com/dhedge/dhedge-v2-sdk)

## Known Limitations
- The dHedge v2 SDK does not yet support automating the whitelisting of wallet addresses on private funds.
- The dHedge v2 SDK does not yet support ganging multiple function calls into a single transaction.
- The Mnemonic is saved as an ENV so we can only have one 'trader' for all portfolios. We may want to store in the db as an encrypted value so each portfolio can have different trading accounts.
- The CoinMarketCap and Zapper API calls do not yet have a defensive [retry strategy](https://github.com/tim-kos/node-retry).
- Currently we're only supporting pools on Polygon; see to the token list in the dhedge lib.
- Signal providers are not notified if signals abruptly stop.
- `maxLeverage` will be ignored if sent by a signal provider.