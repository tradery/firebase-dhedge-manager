const { Dhedge, Network, ethers } = require("@dhedge/v2-sdk");
const _this = this;

exports.initPool = async () => {
    // Initialize our wallet
    const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER);
    const wallet = new ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
    const walletWithProvider = wallet.connect(provider);

    // Initialize dHedge v2 API
    const dhedge = new Dhedge(walletWithProvider, Network.POLYGON);
    return await dhedge.loadPool(process.env.POOL_ADDRESS);
}

exports.getComposition = async () => {
    const pool = await _this.initPool();
    return await pool.getComposition();
};



// exports.trade = async (
//     fromCoin,
//     toCoin,
//     amountOfFromCoin
// ) => {
//     //initialize dhedge pool factory
//     const factory = Factory.initialize();

//     //load pool
//     const pool = await factory.loadPool(process.env.POOL_ADDRESS);

//     // Sets amount to sell & converts to string
//     const amountToSell = (parseFloat(amountOfFromCoin) * 1e18).toFixed(0);

//     return await pool.exchange(fromCoin, amountToSell, toCoin);
// };

// exports.addMember = async (memberAddress) => {
//     // Initialize dhedge pool factory
//     const factory = Factory.initialize();

//     // Load pool
//     const pool = await factory.loadPool(process.env.POOL_ADDRESS);

//     return await pool.addMember(memberAddress);
// };

// exports.getMembers = async () => {
//   // Initialize dhedge pool factory
//   const factory = Factory.initialize();

//   // Load pool
//   const pool = await factory.loadPool(process.env.POOL_ADDRESS);
//   console.log('Summary', await pool.getSummary());
  
// };