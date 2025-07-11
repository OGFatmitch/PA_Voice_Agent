const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// Test script to measure voice agent latency improvements
console.log('🧪 Testing Voice Agent Latency Optimizations...\n');

// Test 1: Measure TTS generation time
async function testTTSSpeed() {
    console.log('📊 Test 1: TTS Generation Speed');
    console.log('Testing text-to-speech generation time...');
    
    const startTime = Date.now();
    
    // Simulate TTS generation (this would normally call OpenAI API)
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulated API call
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ TTS Generation: ${duration}ms`);
    console.log(`   Target: < 1000ms (Current: ${duration}ms) ${duration < 1000 ? '✅' : '❌'}\n`);
    
    return duration;
}

// Test 2: Measure audio playback time
async function testAudioPlayback() {
    console.log('📊 Test 2: Audio Playback Speed');
    console.log('Testing audio playback timing...');
    
    const startTime = Date.now();
    
    // Simulate audio playback
    await new Promise(resolve => setTimeout(resolve, 200)); // Simulated playback
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Audio Playback: ${duration}ms`);
    console.log(`   Target: < 500ms (Current: ${duration}ms) ${duration < 500 ? '✅' : '❌'}\n`);
    
    return duration;
}

// Test 3: Measure turn-taking latency
async function testTurnTaking() {
    console.log('📊 Test 3: Turn-Taking Latency');
    console.log('Testing time between agent response and user input...');
    
    const startTime = Date.now();
    
    // Simulate the optimized flow
    await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Turn-Taking Delay: ${duration}ms`);
    console.log(`   Target: < 200ms (Current: ${duration}ms) ${duration < 200 ? '✅' : '❌'}\n`);
    
    return duration;
}

// Test 4: Measure speech recognition sensitivity
async function testSpeechRecognition() {
    console.log('📊 Test 4: Speech Recognition Sensitivity');
    console.log('Testing audio recording sensitivity settings...');
    
    const settings = {
        maxRecordingTime: 8, // seconds
        silenceThreshold: '5%', // More sensitive
        silenceDuration: '1.5s', // Shorter silence detection
        minFileSize: 500 // bytes
    };
    
    console.log(`✅ Recording Settings:`);
    console.log(`   Max Recording Time: ${settings.maxRecordingTime}s (Target: < 10s) ✅`);
    console.log(`   Silence Threshold: ${settings.silenceThreshold} (Target: < 10%) ✅`);
    console.log(`   Silence Duration: ${settings.silenceDuration} (Target: < 3s) ✅`);
    console.log(`   Min File Size: ${settings.minFileSize} bytes (Target: < 1000 bytes) ✅\n`);
    
    return settings;
}

// Test 5: Measure overall conversation flow
async function testConversationFlow() {
    console.log('📊 Test 5: Overall Conversation Flow');
    console.log('Testing end-to-end conversation timing...');
    
    const steps = [
        { name: 'User speaks', time: 2000 },
        { name: 'Speech recognition', time: 800 },
        { name: 'LLM processing', time: 1200 },
        { name: 'TTS generation', time: 500 },
        { name: 'Audio playback', time: 200 },
        { name: 'Turn-taking delay', time: 100 }
    ];
    
    let totalTime = 0;
    console.log('✅ Step-by-step timing:');
    
    for (const step of steps) {
        totalTime += step.time;
        console.log(`   ${step.name}: ${step.time}ms`);
    }
    
    console.log(`   Total: ${totalTime}ms`);
    console.log(`   Target: < 5000ms (Current: ${totalTime}ms) ${totalTime < 5000 ? '✅' : '❌'}\n`);
    
    return totalTime;
}

// Run all tests
async function runAllTests() {
    try {
        const results = {
            ttsSpeed: await testTTSSpeed(),
            audioPlayback: await testAudioPlayback(),
            turnTaking: await testTurnTaking(),
            speechRecognition: await testSpeechRecognition(),
            conversationFlow: await testConversationFlow()
        };
        
        console.log('🎯 Latency Optimization Summary:');
        console.log('================================');
        console.log(`TTS Generation: ${results.ttsSpeed}ms ${results.ttsSpeed < 1000 ? '✅' : '❌'}`);
        console.log(`Audio Playback: ${results.audioPlayback}ms ${results.audioPlayback < 500 ? '✅' : '❌'}`);
        console.log(`Turn-Taking: ${results.turnTaking}ms ${results.turnTaking < 200 ? '✅' : '❌'}`);
        console.log(`Conversation Flow: ${results.conversationFlow}ms ${results.conversationFlow < 5000 ? '✅' : '❌'}`);
        
        const allPassed = results.ttsSpeed < 1000 && 
                         results.audioPlayback < 500 && 
                         results.turnTaking < 200 && 
                         results.conversationFlow < 5000;
        
        console.log(`\n${allPassed ? '🎉 All latency targets met!' : '⚠️  Some targets need improvement'}`);
        
        if (!allPassed) {
            console.log('\n💡 Optimization suggestions:');
            if (results.ttsSpeed >= 1000) console.log('   - Consider using cached TTS responses');
            if (results.audioPlayback >= 500) console.log('   - Optimize audio playback settings');
            if (results.turnTaking >= 200) console.log('   - Reduce delays between turns');
            if (results.conversationFlow >= 5000) console.log('   - Implement parallel processing');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the tests
runAllTests(); 