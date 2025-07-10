const VoiceAgent = require('./voiceAgent');

async function testLatency() {
    console.log('⏱️ Testing Voice Agent Latency...\n');
    
    const agent = new VoiceAgent();
    
    // Wait for initialization
    while (!agent.sessionService.dataLoaded) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('✅ Agent initialized\n');
    
    // Test common responses
    const testResponses = [
        "I didn't catch the patient's name. Could you please provide the patient's full name?",
        "Thank you. Now I need the patient's date of birth. What is the patient's date of birth?",
        "Thank you. What medication are you requesting authorization for?"
    ];
    
    console.log('🧪 Testing response generation latency...\n');
    
    for (const response of testResponses) {
        console.log(`Testing: "${response.substring(0, 50)}..."`);
        
        const startTime = Date.now();
        
        if (agent.responseCache.has(response)) {
            console.log('  ✅ Using cached response (instant)');
        } else {
            // Test TTS generation time
            const ttsStart = Date.now();
            await agent.speakStreaming(response);
            const ttsTime = Date.now() - ttsStart;
            console.log(`  ⏱️ TTS generation: ${ttsTime}ms`);
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`  📊 Total time: ${totalTime}ms\n`);
    }
    
    console.log('🎯 Latency Test Complete!');
    console.log('\nOptimizations enabled:');
    console.log(`  - Streaming TTS: ${agent.enableStreamingTTS ? '✅' : '❌'}`);
    console.log(`  - Response caching: ${agent.preloadCommonResponses ? '✅' : '❌'}`);
    console.log(`  - Reduced recording time: ${agent.maxRecordingTime}s`);
    console.log(`  - Parallel processing: ${agent.enableParallelProcessing ? '✅' : '❌'}`);
}

testLatency().catch(console.error); 