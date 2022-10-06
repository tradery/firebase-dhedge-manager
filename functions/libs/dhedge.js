const { Dhedge, Dapp, Network, ethers } = require("@dhedge/v2-sdk");
const helpers = require('../libs/helpers');
const _this = this;

exports.tokens = {
    USDC:       '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    DAI:        '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
    USDT:       '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    WBTC:       '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
    AAVEV2:     '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
    AAVEV3:     '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    BTCBEAR2X:  '0x3dbce2c8303609c17aa23b69ebe83c2f5c510ada',
    BTCBULL3X:  '0xdb88ab5b485b38edbeef866314f9e49d095bce39',
};

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

/**
 * Get Balance of a Token
 * 
 * @param {Array} assets An array returned from pool.getComposition()
 * @param {String} token A token's contract address
 * @returns {BigNumber} A token balance in hexidecimal format
 */
exports.getBalance = (assets, token) => {
    for (const asset of assets) {
        if (asset.asset.toLowerCase() == token.toLowerCase()) {
            return ethers.BigNumber.from(asset.balance);
        }
    }

    throw new Error('Could not find the specified asset (' + token + ') in the pool.');
}

exports.decimalToInteger = (amount, decimals) => {
    return amount*('1e' + decimals);
}

exports.getBalanceInfo = (amountBN, decimals) => {
    const amountDecimal = ethers.utils.formatUnits(amountBN, decimals);
    return {
        balanceBN: amountBN,
        balance: amountDecimal,
        balanceRaw: _this.decimalToInteger(amountDecimal),
    }
}

exports.tradeUniswap = async (from, to, amountOfFromToken) => {
    const pool = await _this.initPool();
    const slippageTolerance = 0.5;
    const tx = await pool.tradeUniswapV3(
        from,
        to,
        amountOfFromToken,
        500,
        slippageTolerance,
        _this.gasInfo()
    );

    return tx;
}

exports.trade = async (from, to, amount, dapp = 'SUSHISWAP') => {
    let router;
    switch (dapp) {
      case 'TOROS':
        router = Dapp.TOROS;
        break;
      default:
        router = Dapp.SUSHISWAP;
    }
    
    const pool = await _this.initPool();
    const slippageTolerance = 0.5;
    const tx = await pool.trade(
        router,
        from,
        to,
        amount,
        slippageTolerance,
        _this.gasInfo()
    );

    return tx;
}

exports.lendDeposit = async (token, amount) => {
    const pool = await _this.initPool();
    const tx = await pool.lend(
        Dapp.AAVE, 
        token, 
        amount,
        0,
        _this.gasInfo()
    );

    return tx;
}

exports.withdrawDeposit = async (token, amount) => {
    const pool = await _this.initPool();
    const tx = await pool.withdrawDeposit(
        Dapp.AAVE, 
        token, 
        amount,
        _this.gasInfo()
    );

    return tx;
}

exports.borrowDebt = async (token, amount) => {
    const pool = await _this.initPool();
    const tx = await pool.borrow(
        Dapp.AAVE, 
        token, 
        amount,
        0,
        _this.gasInfo()
    );

    return tx;
}

exports.repayDebt = async (token, amount) => {
    const pool = await _this.initPool();
    const tx = await pool.repay(
        Dapp.AAVE, 
        token, 
        amount,
        _this.gasInfo()
    );

    return tx;
}


/**
 * Approve All Spending Once
 * 
 * This method approves the spending of every approved token in the pool
 * on Uniswap, Sushiswap, AAVEv2, AAVEv3.
 * 
 * @returns Boolean
 */
exports.approveAllSpendingOnce = async () => {
    const pool = await _this.initPool();
    const assets = await pool.getComposition();

    for (const asset of assets) {
        const tx0 = await pool.approve(
            Dapp.AAVE,
            asset.asset,
            ethers.constants.MaxInt256,
            _this.gasInfo()
        );
        helpers.log(tx0);
    
        const tx1 = await pool.approve(
            Dapp.AAVEV3,
            asset.asset,
            ethers.constants.MaxInt256,
            _this.gasInfo()
        );
        helpers.log(tx1);

        const tx2 = await pool.approve(
            Dapp.UNISWAPV3,
            asset.asset,
            ethers.constants.MaxInt256,
            _this.gasInfo()
        );
        helpers.log(tx2);

        const tx3 = await pool.approve(
            Dapp.SUSHISWAP,
            asset.asset,
            ethers.constants.MaxInt256,
            _this.gasInfo()
        );
        helpers.log(tx3);

        const tx4 = await pool.approve(
            Dapp.TOROS,
            asset.asset,
            ethers.constants.MaxInt256,
            _this.gasInfo()
        );
        helpers.log(tx4);
    }

    return true;
}

exports.aaveLeveragedLong = async () => {
  const pool = await _this.initPool();

  // Approve USDC Spending
  // const tx = await pool.approve(
  //     Dapp.AAVE,
  //     TOKENS.WBTC,
  //     ethers.constants.MaxInt256,
  //     _this.gasInfo()
  // )
  // console.log(tx);

// Deposit 1 USDC into Aave lending pool
// const tx = await pool.lend(Dapp.AAVE, USDC_TOKEN_ADDRESS, "1000000")

// Withdraw 1 USDC from Aave lending pool
// const tx = await pool.withdrawDeposit(Dapp.AAVE, USDC_TOKEN_ADDRESS, "1000000")

// Borrow 0.0001 WETH from Aave lending pool
// const tx = await pool.borrow(Dapp.AAVE, WETH_TOKEN_ADDRESS, "100000000000000");

// Repay 0.0001 WETH to Aave lending pool
// const tx = await pool.repay(Dapp.AAVE, WETH_TOKEN_ADDRESS, "100000000000000");

  // Deposit USDC into AAVE
  // const tx2 = await pool.lend(
  //     Dapp.AAVE, 
  //     TOKENS.USDC, 
  //     "1000000",
  //     0,
  //     _this.gasInfo()
  // );
  // console.log(tx2);

  // Borrow WBTC from AAVE
  const tx3 = await pool.borrow(
      Dapp.AAVE, 
      TOKENS.WBTC, 
      "2500",
      0,
      _this.gasInfo()
  );

  return tx3;
};
