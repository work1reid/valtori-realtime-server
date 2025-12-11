// server.js - WebSocket server for OpenAI Realtime API
import WebSocket, { WebSocketServer } from 'ws';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT });

console.log(`✅ WebSocket server running on port ${PORT}`);

wss.on('connection', (clientWs) => {
    console.log('📱 Client connected');
    
    let openaiWs = null;
    
    // Connect to OpenAI Realtime API
    const connectToOpenAI = () => {
        const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
        
        openaiWs = new WebSocket(url, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1'
            }
        });
        
        openaiWs.on('open', () => {
            console.log('🔗 Connected to OpenAI Realtime API');
            
            // Configure the session
            openaiWs.send(JSON.stringify({
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: `You are a B2B prospect receiving a cold call. You are the VP of Sales at a mid-size SaaS company. 
                    
Your personality:
- Skeptical but fair
- Busy (you have a meeting in 10 minutes)
- Will listen if you hear clear value
- Ask tough questions about ROI and implementation
- Sometimes throw objections like "we already have a solution" or "not in the budget"

Behavior:
- Keep responses SHORT (1-2 sentences max)
- Sound natural and conversational
- Use realistic objections
- If the seller does well (good discovery, addresses concerns, shows value), you'll agree to a follow-up meeting
- If they just pitch without asking questions, you'll politely decline

Start by answering the call with a brief greeting.`,
                    voice: 'alloy',
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500
                    }
                }
            }));
        });
        
        openaiWs.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                // Forward relevant events to client
                if (message.type === 'session.created' ||
                    message.type === 'session.updated' ||
                    message.type === 'response.audio.delta' ||
                    message.type === 'response.audio.done' ||
                    message.type === 'response.text.delta' ||
                    message.type === 'response.text.done' ||
                    message.type === 'response.done' ||
                    message.type === 'conversation.item.created' ||
                    message.type === 'input_audio_buffer.speech_started' ||
                    message.type === 'input_audio_buffer.speech_stopped' ||
                    message.type === 'error') {
                    
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify(message));
                    }
                }
                
                // Log errors
                if (message.type === 'error') {
                    console.error('❌ OpenAI error:', message.error);
                }
            } catch (err) {
                console.error('Error parsing OpenAI message:', err);
            }
        });
        
        openaiWs.on('error', (error) => {
            console.error('❌ OpenAI WebSocket error:', error);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'error',
                    error: { message: 'OpenAI connection error' }
                }));
            }
        });
        
        openaiWs.on('close', () => {
            console.log('🔌 OpenAI connection closed');
        });
    };
    
    // Handle client messages
    clientWs.on('message', (data) => {
        try {
            // Check if it's JSON (control message) or binary (audio)
            if (data[0] === 0x7B) { // '{' character (JSON)
                const message = JSON.parse(data.toString());
                
                if (message.type === 'start') {
                    connectToOpenAI();
                } else if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                    openaiWs.send(JSON.stringify(message));
                }
            } else {
                // Binary audio data - forward to OpenAI
                if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                    openaiWs.send(data);
                }
            }
        } catch (err) {
            console.error('Error handling client message:', err);
        }
    });
    
    clientWs.on('close', () => {
        console.log('📴 Client disconnected');
        if (openaiWs) {
            openaiWs.close();
        }
    });
    
    clientWs.on('error', (error) => {
        console.error('❌ Client WebSocket error:', error);
    });
});

// Health check endpoint for Railway
import { createServer } from 'http';
const healthServer = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

healthServer.listen(PORT + 1, () => {
    console.log(`✅ Health check server running on port ${PORT + 1}`);
});