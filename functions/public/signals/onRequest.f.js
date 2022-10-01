const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const { DateTime } = require('luxon');
const setjs = require('set.js');
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

function error(response, statusCode, message) {
    response.status(statusCode).send({
        "timestamp": DateTime.now(),
        "status": statusCode,
        "error": message
    });
    response.end();
}

/**
 * Trade a Tokenset based on a provided buy/sell signal.
 */
exports = module.exports = functions
    .runWith({
        // Ensure the function has enough memory and time to process
        timeoutSeconds: 120,
        memory: "1GB",
    })
    .https
    .onRequest(async (request, response) => {
        cors(request, response, async () => {
            try {
                // Force POST
                if (request.method !== "POST") return error(response, 400, 
                    "Request method must be POST.");
            
                // Handle Auth
                const { authorization }  = request.headers;
                if (!authorization) return error(response, 403, 
                    "Unauthorized. A key must be provided in the `authorization` header.");

                const config = functions.config();
                
                if (authorization !== config.auth.key) return error(response, 403, 
                    "Unauthorized. The API key provided is invalid.");
                
                // Authorized!

                // Set config for SetTokens
                let setConfig = {
                    ethereum: {
                        protocolViewerAddress: "0x74391125304f1e4ce11bDb8aaAAABcF3A3Ae2f41",
                        tradeModuleAddress: "0x90F765F63E7DC5aE97d6c576BF693FB6AF41C129",
                        basicIssuanceModuleAddress: "0xd8EF3cACe8b4907117a45B0b125c68560532F94D",
                        controllerAddress: "0xa4c8d221d8BB851f83aadd0223a8900A6921A349",
                        masterOracleAddress: "0xA60f9e1641747762aDE7FD5F881b90B691E92B0a",
                        navIssuanceModuleAddress: "0xaB9a964c6b95fA529CA7F27DAc1E7175821f2334",
                        setTokenCreatorAddress: "0xeF72D3278dC3Eba6Dc2614965308d1435FFd748a",
                        streamingFeeModuleAddress: "0x08f866c74205617B6F3903EF481798EcED10cDEC",
                        governanceModuleAddress: "0x5C87b042494cDcebA44C541fbB3BC8bFF179d500",
                        debtIssuanceModuleAddress: "0x39F024d621367C044BacE2bf0Fb15Fb3612eCB92",
                    },
                    polygon: {
                        protocolViewerAddress: "0x8D5CF870354ffFaE0586B639da6D4E4F6C659c69",
                        tradeModuleAddress: "0xd04AabadEd11e92Fefcd92eEdbBC81b184CdAc82",
                        basicIssuanceModuleAddress: "0x38E5462BBE6A72F79606c1A0007468aA4334A92b",
                        controllerAddress: "0x75FBBDEAfE23a48c0736B2731b956b7a03aDcfB2",
                        masterOracleAddress: "0x9378Ad514c00E4869656eE27b634d852DD48feAD",
                        navIssuanceModuleAddress: "",
                        setTokenCreatorAddress: "0x14f0321be5e581abF9d5BC76260bf015Dc04C53d",
                        streamingFeeModuleAddress: "0x8440f6a2c42118bed0D6E6A89Bf170ffd13e21c0",
                        governanceModuleAddress: "",
                        debtIssuanceModuleAddress: "0xf2dC2f456b98Af9A6bEEa072AF152a7b0EaA40C9",
                    },
                };
                
                // Initialize Web3 Provider & Tokenset
                // const alchemyUrl = 'https://eth-mainnet.alchemyapi.io/v2/MjGcHKovZe048be3okhkiYQ32nQ8zPpN';
                const alchemyUrl = 'https://polygon-mainnet.g.alchemy.com/v2/H0tRaCBq5zGAOTxP1mI1GiIifjkqneCY';
                const web3 = createAlchemyWeb3(alchemyUrl);

                setConfig.web3Provider = web3.currentProvider;
                const set = new setjs.default(setConfig);
                
                const responseMessage = await set.trade.initializeAsync(
                    '0x6A98857a05aC7bd657D624bAa31f8467550498Aa',
                    '0xF38F9C963f6336e2C69044a575F1E6189B4b49f6',
                );
                console.log(responseMessage);

                

                // const responseMessage = await set.trade.fetchTokenListAsync();

                // const trade = await set.trade.tradeAsync(
                //     '0x6a98857a05ac7bd657d624baa31f8467550498aa',
                //     '0x'
                // );


                // console.log(await set.setToken.getManagerAddressAsync('0x6a98857a05ac7bd657d624baa31f8467550498aa'));

                
                // console.log(trade);

                response.status(200).send({ message: responseMessage });

                // Terminate the function
                response.end();
            } catch (err) {
                functions.logger.error(err, { structuredData: true });
                return error(response, 400, err.message);
            }
        })
    });