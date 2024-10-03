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
    "LINAUSDT"
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
    const streams = symbols.map(symbol => `${symbol}@ticker`).join('/');
    const binanceWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

    // Mapeia para armazenar o último e o penúltimo preço de fechamento
    const priceData = {};

    // Controla o tempo de envio de mensagens
    let lastSentTime = 0;
    const sendInterval = 3000;

    binanceWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { data } = message;

        if (data && data.c) {  // 'c' é o preço de fechamento atual
            const { s: symbol, c: lastClose } = data; // 's' é o símbolo, 'c' é o preço de fechamento atual

            if (priceData[symbol]) {
                const previousClose = priceData[symbol].currentClose; // Preço de fechamento anterior

                // Calcula a variação percentual comparando o último fechamento com o fechamento atual
                const priceChangePercent = ((parseFloat(lastClose) - parseFloat(previousClose)) / parseFloat(previousClose)) * 100;

                // Atualiza os dados de preço, incluindo o preço anterior e o preço atual
                priceData[symbol] = {
                    previousClose: previousClose,    // Preço anterior
                    currentClose: parseFloat(lastClose), // Preço atual
                    priceChangePercent              // Variação percentual
                };
            } else {
                // Se for o primeiro preço, apenas armazena o fechamento atual
                priceData[symbol] = {
                    previousClose: parseFloat(lastClose), // Armazena o primeiro fechamento como "anterior"
                    currentClose: parseFloat(lastClose),  // Também como o "atual" inicialmente
                    priceChangePercent: 0
                };
            }
        }

        const currentTime = Date.now();

        // Envia os dados a cada 1 segundo
        if (currentTime - lastSentTime >= sendInterval) {
            // Converte para array e ordena pelas maiores variações
            const disparities = Object.keys(priceData).map(symbol => ({
                symbol: symbol.replace('usdt', '').toUpperCase(),
                previousClose: priceData[symbol].previousClose, // Preço anterior
                currentClose: priceData[symbol].currentClose,   // Preço atual
                priceChangePercent: priceData[symbol].priceChangePercent // Variação percentual
            }));

            const sortedDisparities = disparities.sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

            // Envia os top 5 pares com maiores variações para o cliente WebSocket
            ws.send(JSON.stringify(sortedDisparities.slice(0, 5)));

            lastSentTime = currentTime; // Atualiza o tempo do último envio
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
        binanceWs.close(); // Fecha a conexão WebSocket da Binance quando o cliente se desconectar
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
