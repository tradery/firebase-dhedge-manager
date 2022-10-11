const { Dhedge, Dapp, Network, ethers } = require("@dhedge/v2-sdk");
const helpers = require('./helpers');
const coinmarketcap = require('./coinmarketcap');
const _this = this;

exports.tokens = {
    polygon: {
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
    }
};

/**
 * Address to Token Symbol
 * 
 * @param {String} address a token contract address
 * @param {String} network a blockchain network
 * @returns {String} a token symbol
 */
exports.addressToSymbol = (address, network = 'polygon') => {
    const tokens = _this.tokens[network];
    for (const token in tokens) {
        if (tokens[token].address.toLowerCase() === address.toLowerCase()) {
            return token;
        }
    }
    return null;
}

/**
 * Token Address to Token Details
 * 
 * @param {String} address a token contract address
 * @param {String} network a blockchain network
 * @returns {Object} a list of useful information about a token
 */
exports.addressToTokenDetails = async (address, network = 'polygon') => {
    const tokens = _this.tokens[network];
    for (const token in tokens) {
        if (tokens[token].address.toLowerCase() === address.toLowerCase()) {
            // Get usd price from coin market cap
            const usdPrice = await coinmarketcap.getUsdPrice(tokens[token].coinMarketCapId);

            // Transform into object
            return {
                symbol: token,
                address: address,
                decimals: tokens[token].decimals,
                usdPrice: usdPrice,
            };
        }
    }
    return null;
}

/**
 * Initial dHedge Pool
 * 
 * @param {String} mnemonic The mnemonic for the pool trader's wallet.
 * @param {String} poolAddress The address of a dhedge pool contract.
 * @param {String} network The blockchain network for this pool contract.
 * @returns {Object} a dhedge pool.
 */
exports.initPool = async (mnemonic, poolAddress, network = Network.POLYGON) => {
    // Initialize our wallet
    const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER);
    const wallet = new ethers.Wallet.fromMnemonic(mnemonic);
    const walletWithProvider = wallet.connect(provider);
    
    // Initialize dHedge v2 API
    const dhedge = new Dhedge(walletWithProvider, network);
    return await dhedge.loadPool(poolAddress);
}

exports.gasInfo = () => {
  const gas = {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
    gasLimit: 3000000
  }
  return gas;
}

/**
 * 
 * @param {Pool} pool a dHedge Pool object
 * @returns {Array} A list of assets approved for trading
 */
exports.getComposition = async (pool) => {
    return await pool.getComposition();
};

/**
 * Get Pool Balances
 * 
 * @param {Pool} pool a dHedge Pool object
 * @returns {Array} A list of tokens with info and balances
 */
exports.getPoolBalances = async (pool) => {
    const composition = await _this.getComposition(pool);
    const network = pool.network;
    let assets = [];
    for (const asset of composition) {
        const tokenDetails = await _this.addressToTokenDetails(asset.asset, network);
        const tokenBalance = _this.getBalanceInfo(
            ethers.BigNumber.from(asset.balance), 
            tokenDetails.decimals,
            tokenDetails.usdPrice
        );
        assets.push({
            ...tokenDetails,
            ...tokenBalance
        });
    }
    return assets;
}

/**
 * Get Balance of a Token
 * 
 * @param {Array} assets An array returned from pool.getComposition()
 * @param {String} token A token's contract address
 * @returns {BigNumber} A token balance in hexidecimal format
 */
exports.getBalance = (assets, token) => {
    for (const asset of assets) {
        if (asset.asset.toLowerCase() === token.toLowerCase()) {
            return ethers.BigNumber.from(asset.balance);
        }
    }

    throw new Error('Could not find the specified asset (' + token + ') in the pool.');
}

/**
 * Get Balance Info for a Token
 * 
 * @param {BigNumber} amountBN Amount in ethers.BigNumber format
 * @param {Integer} decimals Number of decimal places to consider
 * @param {Float} tokenPriceUsd The USD price of a token to convert the big number
 * @returns {Object} A list of balances in different formats
 */
exports.getBalanceInfo = (amountBN, decimals, tokenPriceUsd) => {
    const balanceDecimal = ethers.utils.formatUnits(amountBN, decimals);
    const balanceInt = _this.decimalToInteger(balanceDecimal, decimals);
    const balanceUsd = tokenPriceUsd * balanceDecimal;
    return {
        balanceBn: amountBN,
        balanceDecimal: balanceDecimal,
        balanceInt: balanceInt,
        balanceUsd: balanceUsd
    }
}

/**
 * Decial to Integer
 * 
 * @param {Float} amount Some decimal amount
 * @param {Integer} decimals Number of decimal places
 * @returns {Integer} The value without decimals
 */
exports.decimalToInteger = (amount, decimals) => {
    const response = Math.round(amount*('1e' + decimals));
    return isFinite(response) ? response : null;
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
 * on AAVE v2, Uniswap v3, etc.
 * 
 * @param {Pool} pool dHedge Pool object
 * @param {Array} dapps A list of dapps to approve
 * @returns {Boolean} Boolean true if successful.
 */
exports.approveAllSpendingOnce = async (pool, dapps) => {
    const assets = await pool.getComposition();
    let dappsToApprove = dapps;
    if (dappsToApprove === undefined) {
        dappsToApprove = [
            Dapp.AAVE,
            Dapp.UNISWAPV3,
            // Dapp.AAVEV3,
            // Dapp.SUSHISWAP,
            // Dapp.TOROS,
        ];
    }

    for (const asset of assets) {
        for (const dapp of dappsToApprove) {
            helpers.log(
                'Approving spending of ' + asset.asset
                + ' on ' + dapp
            );
            await pool.approve(
                dapp,
                asset.asset,
                ethers.constants.MaxInt256,
                _this.gasInfo()
            );
        }
    }

    return true;
}
