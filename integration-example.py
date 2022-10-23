# integration-example.py
#!/usr/bin/env python3

import requests

# Send signals to a DeFi funds managed by the Firebase dHedge Manager

# apikey: a secret key for accessing the API
# secret: a secret key for a specific portfolio and strategy
# longToken: the token to long (e.g. BTC, ETH, USDC, MATIC, etc.)
# shortToken: the token to long (e.g. BTC, ETH, USDC, MATIC, etc.)
# maxLeverage: a floating point number between 1-5. 1 means no shorting.
def setSignal(apikey, secret, longToken, shortToken, maxLeverage):
    res = requests.post(
        'https://YOUR-PROJECT.cloudfunctions.net/publicSetSignalOnRequest', 
        json={
            'secret': secret,
            'longToken': longToken,
            'shortToken': shortToken,
            'maxLeverage': maxLeverage
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
setSignal('key', 'secret', 'BTC', 'USDC', '1.5')

# Sell BTC and buy USDC (open a leveraged short position on BTC)
setSignal('key', 'secret', 'USDC', 'BTC', '2.5'); 

# Sell whatever we're holding and go to USD (unlevered, neutral position)
setSignal('key', 'secret', 'USDC', 'USDC', '1'); 