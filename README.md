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
- Run `firebase functions:secrets:set PROVIDER` to set the RPC provider and API key. e.g. https://polygon-mainnet.infura.io/v3/your-code-here
- Run `firebase functions:secrets:set POOL_ADDRESS` to set the pool address that you wish to manage using the provided mnemonic.
- Run `firebase functions:secrets:set COIN_MARKET_CAP_API_KEY` to set your CoinMarketCap API key. This enables price lookups.

## Notes on functions
### Overview
- Functions are in the `./functions` folder
- Each function is nested into `./functions/{callType}/{descriptiveName}/onRequest.f.js`

### Local development
- Run `npm install` from `./functions`
- Emulate Firebase Functions locally by running `firebase emulators:start` from the `functions` directory of this project.
- Sometimes emulators don't close their ports properly. Try this on Mac (of course updating it to match the port that was mistakenly left open) `lsof -t -i tcp:5002 | xargs kill`

### Deployment instructions
- Run `firebase deploy` from the root directory of this project.

### Helpful links
- [Video on Firebase emulators](https://www.youtube.com/watch?v=pkgvFNPdiEs)
- [Google Developers API Console](https://console.developers.google.com/apis/dashboard)
- [dHedge SDK v2](https://github.com/dhedge/dhedge-v2-sdk)

### Known Limitations
- There is no logging of inbound signals; they are simply read and processed.
- This application is simple by design; it only works for managing a single pool on dHedge.
- The dHedge v2 SDK does not yet support whitelisting addresses on private funds
- The CoinMarketCap API calls do not yet have a defensive [retry strategy](https://github.com/tim-kos/node-retry)