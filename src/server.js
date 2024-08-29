const express = require('express');
const ccxt = require('ccxt');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/disparities', async (req, res) => {
    const exchange = new ccxt.binanceusdm(); // Conecta à Binance USDT-M Futures

    try {
        const markets = await exchange.loadMarkets();
        const symbols = Object.keys(markets).filter(symbol => symbol.endsWith('USDT'));
        // console.log(symbols)
        const promises = symbols.map(async symbol => {
            try {
                const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 1);
                if (ohlcv.length > 0) {
                    const [timestamp, open, high, low, close, volume] = ohlcv[0];
                    const priceChangePercent = ((close - open) / open) * 100;
                    return { symbol: symbol.replace(':USDT', '').replace('/', ''), priceChangePercent, open, close, volume };
                }
            } catch (error) {
                // Ignore erros individuais
            }
            return null;
        });

        const disparities = (await Promise.all(promises)).filter(disparity => disparity !== null);
        const sortedDisparities = disparities.sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

        res.json(sortedDisparities.slice(0, 5)); // Retorna os top 5 pares como JSON
    } catch (error) {
        res.status(500).send('Erro ao buscar os dados.');
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
