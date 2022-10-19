# integration-example.py
#!/usr/bin/env python3

import requests

# Send signals to a DeFi funds managed by the Firebase dHedge Manager

# apikey: a secret key for accessing the API
# secret: a secret key for a specific portfolio and strategy
# longToken: the token to long (e.g. BTC, ETH, USDC, MATIC, etc.)
# shortToken: the token to long (e.g. BTC, ETH, USDC, MATIC, etc.)
def setSignal(apikey, secret, longToken, shortToken):
    res = requests.post(
        'https://YOUR-PROJECT.cloudfunctions.net/publicSetSignalOnRequest', 
        json={
            'secret': secret,
            'longToken': longToken,
            'shortToken': shortToken
        },
        headers={
            'authorization': apikey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'deflate, gzip'
        }
    )
    return res.json()

# EXAMPLE USAGE BELOW

# Buy BTC using USDC (open leveraged long position on BTC)
setSignal('key', 'secret', 'BTC', 'USDC')

# Sell BTC and buy USDC (open a leveraged short position on BTC)
setSignal('key', 'secret', 'USDC', 'BTC'); 

# Sell whatever we're holding and go to USD (unlevered, neutral position)
setSignal('key', 'secret', 'USDC', 'USDC'); 