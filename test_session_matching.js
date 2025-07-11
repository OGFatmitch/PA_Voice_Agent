const sessionService = require('./services/sessionService');

async function testSessionMatching() {
    console.log('🧪 Testing Session-Based Answer Matching\n');

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create a test session
    const sessionId = sessionService.createSession();
    
    // Update session with test data
    sessionService.updateSession(sessionId, {
        memberName: 'John Doe',
        dateOfBirth: '1980-01-01',
        drugName: 'Methotrexate',
        drugId: 'methotrexate',
        step: 'question_flow'
    });

    // Initialize question flow for testing
    sessionService.initializeQuestionFlow(sessionId, 'methotrexate');

    console.log('📝 Testing "severe rheumatoid arthritis" in session flow:');
    
    // Test the specific case that was failing
    const result = await sessionService.processAnswer(sessionId, 'severe rheumatoid arthritis');
    
    console.log('\n🔍 Session Processing Result:');
    console.log('Action:', result.action);
    console.log('Decision:', result.decision);
    console.log('Reason:', result.reason);
    
    if (result.action === 'next_question') {
        console.log('Next Question:', result.question?.text);
    } else if (result.action === 'complete') {
        console.log('✅ Session completed successfully!');
        console.log('Final Decision:', result.decision);
        console.log('Reasoning:', result.reason);
    } else if (result.action === 'clarification') {
        console.log('❌ Needs clarification:', result.message);
    } else if (result.action === 'error') {
        console.log('❌ Error occurred:', result.message);
    }

    // Test a few more variations
    const testCases = [
        'severe rheumatoid arthritis',
        'moderate rheumatoid arthritis', 
        'chronic rheumatoid arthritis',
        'the patient has severe rheumatoid arthritis',
        'it is severe rheumatoid arthritis'
    ];

    console.log('\n📋 Testing Multiple Variations:');
    
    for (let i = 0; i < testCases.length; i++) {
        const response = testCases[i];
        console.log(`\nTest ${i + 1}: "${response}"`);
        
        try {
            const sessionResult = await sessionService.processAnswer(sessionId, response);
            
            if (sessionResult.action === 'clarification') {
                console.log(`❌ Needs Clarification: ${sessionResult.message}`);
            } else if (sessionResult.action === 'next_question') {
                console.log(`✅ Accepted, moving to next question`);
            } else if (sessionResult.action === 'complete') {
                console.log(`✅ Session completed with decision: ${sessionResult.decision}`);
            } else if (sessionResult.action === 'error') {
                console.log(`❌ Error: ${sessionResult.message}`);
            } else {
                console.log(`✅ Processed: ${sessionResult.action}`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }

    console.log('\n✅ Session-based matching test completed!');
    console.log('\n💡 The system should now correctly handle:');
    console.log('- "severe rheumatoid arthritis" → matches "Rheumatoid Arthritis"');
    console.log('- Medical modifiers are intelligently handled');
    console.log('- Natural language variations are processed');
    console.log('- Session context is maintained throughout the flow');
}

// Run the test
testSessionMatching().catch(console.error); 