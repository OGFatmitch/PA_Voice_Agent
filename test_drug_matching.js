const sessionService = require('./services/sessionService');

async function testDrugMatching() {
    console.log('🧪 Testing Drug Matching...\n');
    
    // Wait for data to load
    while (!sessionService.dataLoaded) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('✅ Data loaded successfully\n');
    
    // Test various inputs for mounjaro
    const testCases = [
        'mounjaro',
        'Mounjaro',
        'MOUNJARO',
        'mounjaro medication',
        'I need mounjaro',
        'manjaro', // This should NOT match mounjaro
        'tirzepatide', // Generic name
        'zepbound' // Common name
    ];
    
    for (const testCase of testCases) {
        console.log(`\n🔍 Testing: "${testCase}"`);
        sessionService.debugDrugMatching(testCase);
        console.log('─'.repeat(50));
    }
}

testDrugMatching().catch(console.error); 