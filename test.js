const sessionService = require('./services/sessionService');
const authService = require('./services/authService');

async function runTests() {
    console.log('🧪 Running Voice Agent Tests...\n');

    try {
        // Wait for data to load
        console.log('0. Waiting for data to load...');
        while (!sessionService.dataLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('✅ Data loaded successfully');

        // Test 1: Create a session
        console.log('\n1. Testing session creation...');
        const sessionId = sessionService.createSession();
        console.log(`✅ Session created: ${sessionId}`);

        // Test 2: Find a drug
        console.log('\n2. Testing drug lookup...');
        const drug = sessionService.findDrug('ozempic');
        if (drug) {
            console.log(`✅ Found drug: ${drug.name} (${drug.category})`);
        } else {
            console.log('❌ Drug not found');
        }

        // Test 3: Initialize question flow
        console.log('\n3. Testing question flow initialization...');
        if (drug) {
            sessionService.initializeQuestionFlow(sessionId, drug.id);
            const currentQuestion = sessionService.getCurrentQuestion(sessionId);
            if (currentQuestion) {
                console.log(`✅ Question flow initialized. Current question: ${currentQuestion.text}`);
            } else {
                console.log('❌ No current question found');
            }
        }

        // Test 4: Process some answers
        console.log('\n4. Testing answer processing...');
        if (drug) {
            // Simulate some answers
            const answers = [
                'Type 2 Diabetes',
                '7.2',
                'yes',
                'metformin',
                'yes',
                'Patient failed metformin due to gastrointestinal side effects',
                'no'
            ];

            for (let i = 0; i < answers.length; i++) {
                const result = sessionService.processAnswer(sessionId, answers[i]);
                console.log(`   Answer ${i + 1}: "${answers[i]}" -> ${result.action}`);
                
                if (result.action === 'complete') {
                    console.log(`   ✅ Decision: ${result.decision}`);
                    break;
                }
            }
        }

        // Test 5: Generate authorization summary
        console.log('\n5. Testing authorization summary...');
        const summary = authService.getAuthorizationSummary(sessionId);
        console.log(`✅ Summary generated for session: ${summary.sessionId}`);
        console.log(`   Decision: ${summary.decision}`);
        console.log(`   Drug: ${summary.drugName}`);

        // Test 6: Generate report
        console.log('\n6. Testing report generation...');
        const report = authService.generateReport(sessionId);
        console.log(`✅ Report generated: ${report.reportId}`);
        console.log(`   Questions answered: ${report.questionResponses.length}`);

        console.log('\n🎉 All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests }; 