# firebase-set-manager
An API that allows data scientists to effortlessly send trading signals to the Set protocol.

### Notes on functions
- Functions are in the `./functions` folder
- Each function is nested into `./functions/{callType}/{descriptiveName}/onRequest.f.js`

### To save/see environmental keys
Environmental keys are used for authentication and accessing Tokensets. Keys are deployed remotely during deployement. 
- Run `firebase functions:config:set auth.key="THE API KEY" tokensets.key="THE KEY"`
- Run `firebase functions:config:get` to see the keys. 

### Local development
- To use environmental variables, you must first run `firebase functions:config:get > .runtimeconfig.json` from your `functions` folder.
- Then emulate Firebase Functions by running `firebase emulators:start` from the `functions` directory of this project.

### Deployment instructions
- Run `firebase deploy` from the root directory of this project.

### Helpful links
- [Video on Firebase emulators](https://www.youtube.com/watch?v=pkgvFNPdiEs)
- [Google Developers API Console](https://console.developers.google.com/apis/dashboard)