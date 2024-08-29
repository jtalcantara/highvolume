const ccxt = require('ccxt');

// Função principal que obtém a variação percentual de preço em futuros USDⓈ-M na última hora
async function getTopPriceDisparity(interval = 1000) { // 1000 ms = 1 segundo
    const exchange = new ccxt.binanceusdm(); // Conecta à Binance USDT-M Futures

    while (true) {
        try {
            // Obtém os pares de mercado de futuros na categoria USDⓈ-M
            const markets = await exchange.loadMarkets();

            // Filtra apenas os pares USDⓈ-M
            const symbols = Object.keys(markets).filter(symbol => symbol.endsWith('USDT'));

            // Cria um array de promessas para buscar os candles de cada par
            const promises = symbols.map(async symbol => {
                try {
                    const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 1); // Obtém o último candle de 1 minuto
                    if (ohlcv.length > 0) {
                        const [timestamp, open, high, low, close, volume] = ohlcv[0];
                        const priceChangePercent = ((close - open) / open) * 100;
                        return { symbol, priceChangePercent, open, close, volume };
                    }
                } catch (error) {
                    // console.error(`Erro ao buscar dados para o par ${symbol}:`, error.message);
                }
                return null;
            });

            // Aguarda a resolução de todas as promessas
            const disparities = (await Promise.all(promises)).filter(disparity => disparity !== null);

            // Ordena os pares pela variação percentual em ordem decrescente
            const sortedDisparities = disparities.sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

            // Exibe os top 8 pares com a maior variação percentual
            console.log("");
            console.log(`================================================================================`);
            sortedDisparities.slice(0, 5).forEach(({ symbol, priceChangePercent, open, close, volume }) => {
                const formattedSymbol = symbol.replace(':USDT', '').replace('/', ''); // Remove o sufixo "USDT"
                console.log(`${formattedSymbol} | ${volume} | ${open} ${close} | ${priceChangePercent.toFixed(2)}%`);
            });
            console.log(`================================================================================`);
            console.log("");

            // Aguarda o intervalo especificado antes de repetir
            await new Promise(resolve => setTimeout(resolve, interval));
        } catch (error) {
            console.error('Erro ao buscar os dados:', error);
        }
    }
}

// Executa a função com intervalo de 1 segundo (1000 ms)
getTopPriceDisparity(1000);
