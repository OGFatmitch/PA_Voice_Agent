const sessionService = require('./services/sessionService');

async function testSevereRheumatoid() {
    console.log('🔍 Testing "severe rheumatoid arthritis" Fix\n');

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    const diagnosisQuestion = {
        id: 'diagnosis',
        text: 'What is the primary diagnosis for this patient?',
        type: 'multiple_choice',
        options: ['Rheumatoid Arthritis', 'Psoriatic Arthritis', 'Ankylosing Spondylitis', 'Crohn\'s Disease', 'Ulcerative Colitis', 'Psoriasis', 'Other']
    };

    // Test your specific case and similar variations
    const testCases = [
        'severe rheumatoid arthritis',
        'moderate rheumatoid arthritis',
        'mild rheumatoid arthritis',
        'chronic rheumatoid arthritis',
        'active rheumatoid arthritis',
        'rheumatoid arthritis',
        'rheumatoid',
        'arthritis',
        'severe psoriatic arthritis',
        'moderate crohn\'s disease',
        'severe ulcerative colitis'
    ];

    console.log('📝 Testing Enhanced Multiple Choice Matching:');
    testCases.forEach((response, index) => {
        console.log(`\nTest ${index + 1}: "${response}"`);
        
        try {
            const processed = sessionService.processShortAnswer(response, diagnosisQuestion);
            
            if (processed.needsClarification) {
                console.log(`❌ Needs Clarification: ${processed.clarificationMessage}`);
            } else {
                console.log(`✅ Accepted: "${processed.answer}"`);
            }
            
            // Show the enhanced matching process
            const enhancedMatches = sessionService.findEnhancedMatches(response.toLowerCase(), diagnosisQuestion.options);
            console.log(`   Enhanced matches found: [${enhancedMatches.join(', ')}]`);
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    });

    // Test other common medical scenarios
    console.log('\n\n📝 Testing Other Medical Conditions:');
    
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
        'uncontrolled type 2 diabetes'
    ];

    diabetesTests.forEach((response, index) => {
        console.log(`\nDiabetes Test ${index + 1}: "${response}"`);
        
        try {
            const processed = sessionService.processShortAnswer(response, diabetesQuestion);
            
            if (processed.needsClarification) {
                console.log(`❌ Needs Clarification: ${processed.clarificationMessage}`);
            } else {
                console.log(`✅ Accepted: "${processed.answer}"`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    });

    console.log('\n✅ Test completed!');
    console.log('\n💡 The system should now correctly handle:');
    console.log('- Medical modifiers (severe, moderate, mild, etc.)');
    console.log('- Common abbreviations (RA, T2DM, etc.)');
    console.log('- Different word orders and phrasing');
    console.log('- Extra descriptive words');
}

// Run the test
testSevereRheumatoid().catch(console.error); 