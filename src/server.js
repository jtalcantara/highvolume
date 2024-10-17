const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');

const app = express();
const port = 3000;
const wssPort = 3001;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const skipPairs = [
    "CRVUSDT",
    "XEMUSDT",
    "LINAUSDT",
    "FLOWUSDT",
    "EOSUSDT"
]

// Função para obter todos os pares USDⓈ-M
async function getFuturesSymbols() {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const symbols = response.data.symbols
        .filter(symbol => symbol.symbol.endsWith('USDT') && symbol.contractType === 'PERPETUAL' && !skipPairs.includes(symbol.symbol))
        .map(symbol => symbol.symbol.toLowerCase());
    return symbols;
}

// Servidor WebSocket
const wss = new WebSocket.Server({ port: wssPort });

// Função para monitorar variações de preço em tempo real usando WebSocket da Binance
async function monitorDisparities(ws) {
    const symbols = await getFuturesSymbols(); // Obtém todos os pares USDⓈ-M
    const streams = symbols.map(symbol => `${symbol}@kline_15m`).join('/');
    const binanceWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

    // Mapeia para armazenar os dados do candle
    const priceData = {};

    // Controla o tempo de envio de mensagens
    let lastSentTime = 0;
    const sendInterval = 5000;

    binanceWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { data } = message;

        if (data && data.k) {  // 'k' contém os dados do candle
            const { s: symbol, k: { o: openPrice, c: closePrice, h: high, l: low } } = data; // 's' é o símbolo, 'o' é o preço de abertura, 'c' é o preço de fechamento

            if (priceData[symbol]) {
                const previousClose = priceData[symbol].currentClose; // Preço de fechamento anterior

                // Calcula a variação percentual comparando o último fechamento com o fechamento atual
                const priceChangePercent = ((parseFloat(closePrice) - parseFloat(previousClose)) / parseFloat(previousClose)) * 100;
                const priceOpenChangePercent = ((parseFloat(closePrice) - parseFloat(openPrice)) / parseFloat(openPrice)) * 100;
                const amplitude = ((parseFloat(low) - parseFloat(high)) / parseFloat(high)) * 100;

                // Atualiza os dados de preço
                priceData[symbol] = {
                    previousClose: previousClose,
                    currentClose: parseFloat(closePrice),
                    openPrice,
                    priceChangePercent,
                    priceOpenChangePercent,
                    amplitude
                };
            } else {
                // Se for o primeiro preço, apenas armazena o fechamento atual
                priceData[symbol] = {
                    previousClose: parseFloat(closePrice), // Armazena o primeiro fechamento como "anterior"
                    currentClose: parseFloat(closePrice),
                    openPrice,  // Preço de abertura
                    priceChangePercent: 0,
                    priceOpenChangePercent: 0,
                    amplitude: 0
                };
            }
        }

        const currentTime = Date.now();

        // Envia os dados a cada 4 segundos
        if (currentTime - lastSentTime >= sendInterval) {
            // Converte para array e ordena pelas maiores variações
            const disparities = Object.keys(priceData).map(symbol => ({
                symbol: symbol.replace('usdt', '').toUpperCase(),
                previousClose: priceData[symbol].previousClose,
                currentClose: priceData[symbol].currentClose,
                openPrice: priceData[symbol].openPrice,
                priceChangePercent: priceData[symbol].priceChangePercent,
                priceOpenChangePercent: priceData[symbol].priceOpenChangePercent,
                amplitude: priceData[symbol].amplitude,
            }));

            const sortedDisparities = disparities.sort((a, b) => Math.abs(b.priceOpenChangePercent) - Math.abs(a.priceOpenChangePercent));

            // Envia os top 5 pares com maiores variações para o cliente WebSocket
            ws.send(JSON.stringify(sortedDisparities.slice(0, 5)));

            lastSentTime = currentTime;
        }
    };

    binanceWs.onerror = (error) => {
        console.error('Erro no WebSocket da Binance:', error);
    };

    binanceWs.onclose = () => {
        console.log('Conexão com WebSocket da Binance encerrada');
    };

    ws.on('close', () => {
        console.log('Cliente desconectado do WebSocket');
        binanceWs.close();
    });
}

// Conexão WebSocket
wss.on('connection', (ws) => {
    console.log('Cliente conectado ao WebSocket');
    monitorDisparities(ws);
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log(`WebSocket rodando em ws://localhost:${wssPort}`);
});
