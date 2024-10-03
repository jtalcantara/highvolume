const axios = require('axios');
const { MACD, RSI } = require('technicalindicators');

// Função para obter dados de candles (historical klines) da Binance
async function getHistoricalData(symbol = 'BTCUSDT', interval = '15m', limit = 1000) {
    const endpoint = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(endpoint);
    return response.data.map(candle => ({
        openTime: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
        closeTime: candle[6],
        quoteAssetVolume: candle[7],
        numberOfTrades: candle[8],
        takerBuyBaseAssetVolume: candle[9],
        takerBuyQuoteAssetVolume: candle[10],
    }));
}

// Função para calcular MACD e RSI e executar a estratégia
function backtestStrategy(candles) {
    const closePrices = candles.map(c => c.close);
    const macd = MACD.calculate({ values: closePrices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    const rsi = RSI.calculate({ period: 14, values: closePrices });

    let signals = [];
    let wins = 0;
    let losses = 0;

    for (let i = 26; i < candles.length; i++) {
        const currentPrice = closePrices[i];
        const currentMACD = macd[i - 26];
        const currentRSI = rsi[i - 14];

        // Verifica se o MACD e o RSI são válidos
        if (!currentMACD || !currentRSI) continue;

        // Imprimir os valores dos indicadores para depuração
        console.log(`Time: ${candles[i].closeTime}, Price: ${currentPrice}, MACD: ${currentMACD.macd}, Signal: ${currentMACD.signal}, RSI: ${currentRSI}`);

        // Condições de Sinal
        // Sinal de Compra: MACD cruza acima do sinal e RSI < 70
        if (currentMACD.macd > currentMACD.signal && currentRSI < 70) {
            signals.push({ type: 'buy', price: currentPrice, time: candles[i].closeTime });
        }
        // Sinal de Venda: MACD cruza abaixo do sinal e RSI > 30
        else if (currentMACD.macd < currentMACD.signal && currentRSI > 30) {
            signals.push({ type: 'sell', price: currentPrice, time: candles[i].closeTime });
        }

        // Backtest: calcular a taxa de acerto
        if (signals.length > 1) {
            const lastSignal = signals[signals.length - 2];
            if (lastSignal.type === 'buy' && signals[signals.length - 1].type === 'sell') {
                if (signals[signals.length - 1].price > lastSignal.price) {
                    wins++;
                } else {
                    losses++;
                }
            }
        }
    }

    const totalTrades = wins + losses;
    const accuracy = (totalTrades > 0) ? (wins / totalTrades) * 100 : 0;

    console.log(`Total de Trades: ${totalTrades}`);
    console.log(`Trades Ganhos: ${wins}`);
    console.log(`Trades Perdidos: ${losses}`);
    console.log(`Taxa de Acerto: ${accuracy.toFixed(2)}%`);
}

// Função principal
async function runBacktest() {
    const candles = await getHistoricalData('BTCUSDT', '15m', 1000); // Baixar dados de 1000 candles de 15 minutos
    backtestStrategy(candles);
}

// Executar o backtest
runBacktest();
