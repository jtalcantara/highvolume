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

// Função para obter todos os pares USDⓈ-M
async function getFuturesSymbols() {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const symbols = response.data.symbols
        .filter(symbol => symbol.symbol.endsWith('USDT') && symbol.contractType === 'PERPETUAL')
        .map(symbol => symbol.symbol.toLowerCase());
    return symbols;
}

// Servidor WebSocket
const wss = new WebSocket.Server({ port: wssPort });

// Função para monitorar disparidades usando WebSocket da Binance
async function monitorDisparities(ws) {
    const symbols = await getFuturesSymbols(); // Obtém todos os pares USDⓈ-M
    const streams = symbols.map(symbol => `${symbol}@kline_1m`).join('/');
    const binanceWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

    // Mapeia para armazenar o último kline
    const lastKlines = {};

    binanceWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { data } = message;

        if (data && data.k) {
            const { s: symbol, k: kline } = data;
            if (kline.x) { // Verifica se o kline está fechado
                const { o: open, l: last, v: volume } = kline;
                const priceChangePercent = ((parseFloat(last) - parseFloat(open)) / parseFloat(open)) * 100;
                lastKlines[symbol] = { priceChangePercent, open: parseFloat(open), close: parseFloat(last), volume: parseFloat(volume) };
            }
        }

        // Converte para array e ordena pelas maiores disparidades
        const disparities = Object.keys(lastKlines).map(symbol => ({
            symbol: symbol.replace('usdt', '').toUpperCase(),
            ...lastKlines[symbol]
        }));

        const sortedDisparities = disparities.sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

        // Envia os top 5 pares para o cliente WebSocket
        ws.send(JSON.stringify(sortedDisparities.slice(0, 5)));
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
