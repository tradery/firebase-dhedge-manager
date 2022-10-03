const { Dhedge, Dapp, Network, ethers } = require("@dhedge/v2-sdk");
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

exports.gasInfo = () => {
  const gas = {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
    gasLimit: 3000000
  }
  return gas;
}

exports.getComposition = async () => {
    const pool = await _this.initPool();
    return await pool.getComposition();
};

exports.trade = async () => {
    const pool = await _this.initPool();

    const tx = await pool.approve(
        Dapp.TOROS,
        '0x3dbce2c8303609c17aa23b69ebe83c2f5c510ada',
        ethers.constants.MaxInt256,
        _this.gasInfo()
    )
    console.log(tx);

    return await pool.trade(
        Dapp.TOROS, 
        '0x3dbce2c8303609c17aa23b69ebe83c2f5c510ada', // bitcoin bear 2x
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // usdc
        ethers.utils.parseEther('1'),
        0.5,
        _this.gasInfo()
    );
};
