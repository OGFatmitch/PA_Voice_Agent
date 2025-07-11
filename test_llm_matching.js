const sessionService = require('./services/sessionService');

async function testLLMMatching() {
    console.log('🤖 Testing LLM-Based Answer Matching\n');

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    const diagnosisQuestion = {
        id: 'diagnosis',
        text: 'What is the primary diagnosis for this patient?',
        type: 'multiple_choice',
        options: ['Rheumatoid Arthritis', 'Psoriatic Arthritis', 'Ankylosing Spondylitis', 'Crohn\'s Disease', 'Ulcerative Colitis', 'Psoriasis', 'Other']
    };

    // Test cases including your specific issue
    const testCases = [
        'severe rheumatoid arthritis',
        'moderate rheumatoid arthritis',
        'chronic rheumatoid arthritis',
        'active rheumatoid arthritis',
        'rheumatoid arthritis',
        'rheumatoid',
        'arthritis',
        'ra',
        'severe psoriatic arthritis',
        'moderate crohn\'s disease',
        'severe ulcerative colitis',
        'the patient has rheumatoid arthritis',
        'it is rheumatoid arthritis',
        'rheumatoid arthritis disease',
        'type 2 diabetes',
        'diabetes type 2',
        't2dm'
    ];

    console.log('📝 Testing LLM-Based Multiple Choice Matching:');
    
    for (let i = 0; i < testCases.length; i++) {
        const response = testCases[i];
        console.log(`\nTest ${i + 1}: "${response}"`);
        
        try {
            const processed = await sessionService.processShortAnswer(response, diagnosisQuestion);
            
            if (processed.needsClarification) {
                console.log(`❌ Needs Clarification: ${processed.clarificationMessage}`);
            } else {
                console.log(`✅ Accepted: "${processed.answer}"`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }

    // Test diabetes question
    console.log('\n\n📝 Testing Diabetes Question:');
    
    const diabetesQuestion = {
        id: 'diagnosis',
        text: 'What is the primary diagnosis for this patient?',
        type: 'multiple_choice',
        options: ['Type 2 Diabetes', 'Type 1 Diabetes', 'Obesity', 'Other']
    };

    const diabetesTests = [
        'type 2 diabetes',
        'diabetes type 2',
        't2dm',
        'diabetes mellitus type 2',
        'controlled type 2 diabetes',
        'uncontrolled type 2 diabetes',
        'the patient has type 2 diabetes',
        'it is type 2 diabetes'
    ];

    for (let i = 0; i < diabetesTests.length; i++) {
        const response = diabetesTests[i];
        console.log(`\nDiabetes Test ${i + 1}: "${response}"`);
        
        try {
            const processed = await sessionService.processShortAnswer(response, diabetesQuestion);
            
            if (processed.needsClarification) {
                console.log(`❌ Needs Clarification: ${processed.clarificationMessage}`);
            } else {
                console.log(`✅ Accepted: "${processed.answer}"`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }

    console.log('\n✅ LLM-based matching test completed!');
    console.log('\n💡 The LLM should now intelligently handle:');
    console.log('- Medical modifiers (severe, moderate, mild, etc.)');
    console.log('- Common abbreviations (RA, T2DM, etc.)');
    console.log('- Natural language variations');
    console.log('- Different word orders and phrasing');
    console.log('- Extra descriptive words');
}

// Run the test
testLLMMatching().catch(console.error); 