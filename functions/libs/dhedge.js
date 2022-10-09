const { Dhedge, Dapp, Network, ethers } = require("@dhedge/v2-sdk");
const helpers = require('./helpers');
const coinmarketcap = require('./coinmarketcap');
const _this = this;

/**
 * @LIMITATION Locked to Polygon network
 */
exports.tokens = {
    USDC: {
        address:  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
        decimals: 6,
        coinMarketCapId: 3408,
    },
    WBTC: {
        address:  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
        decimals: 8,
        coinMarketCapId: 1,

    },
    WETH: {
        address:  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        decimals: 18,
        coinMarketCapId: 1027,
    },
    MATIC: {
        address:  '0x0000000000000000000000000000000000001010',
        decimals: 18,
        coinMarketCapId: 3890,
    },
    AAVEV2: {
        address:  '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
        decimals: null,
        coinMarketCapId: null,
    },
};

exports.addressToSymbol = (address) => {
    const tokens = _this.tokens;
    for (const token in tokens) {
        if (tokens[token].address.toLowerCase() == address.toLowerCase()) {
            return token;
        }
    }
}

exports.addressToTokenDetails = (address) => {
    const tokens = _this.tokens;
    for (const token in tokens) {
        if (tokens[token].address.toLowerCase() == address.toLowerCase()) {
            // get usd price from coin market cap
            
            // transform into object
            return {
                symbol: token,
                address: address,
                decimals: tokens[token].decimals,
                usdPrice: '',
            };
        }
    }
}

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

exports.getBalanceInfo = (amountBN, decimals) => {
    const amountDecimal = ethers.utils.formatUnits(amountBN, decimals);

    return {
        bigNumber: amountBN,
        decimal: amountDecimal,
        integer: _this.decimalToInteger(amountDecimal),
    }
}

exports.decimalToInteger = (amount, decimals) => {
    return Math.round(amount*('1e' + decimals));
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
