const sessionService = require('./services/sessionService');

async function debugTranscriptionIssue() {
    console.log('🔍 Debug Transcription Issue\n');

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test cases - replace these with your actual scenario
    const testCases = [
        {
            question: {
                id: 'diagnosis',
                text: 'What is the primary diagnosis for this patient?',
                type: 'multiple_choice',
                options: ['Rheumatoid Arthritis', 'Psoriatic Arthritis', 'Ankylosing Spondylitis', 'Crohn\'s Disease', 'Ulcerative Colitis', 'Psoriasis', 'Other']
            },
            userResponses: [
                'rheumatoid arthritis',
                'rheumatoid',
                'arthritis',
                'rheumatoid arthritis disease',
                'the patient has rheumatoid arthritis',
                'it is rheumatoid arthritis',
                'yes rheumatoid arthritis',
                'rheumatoid arthritis please'
            ]
        },
        {
            question: {
                id: 'a1c_level',
                text: 'What is the patient\'s most recent A1C level?',
                type: 'numeric',
                validation: { range: { min: 6.5, max: 15 } }
            },
            userResponses: [
                'seven point two',
                '7.2',
                '7.2 percent',
                'the a1c is 7.2',
                'it is 7.2',
                'seven point two percent'
            ]
        },
        {
            question: {
                id: 'step_1_required',
                text: 'Has the patient tried required step 1 medications?',
                type: 'yes_no'
            },
            userResponses: [
                'yes',
                'no',
                'yeah',
                'nope',
                'sure',
                'absolutely',
                'definitely not',
                'they have tried methotrexate',
                'patient tried methotrexate'
            ]
        }
    ];

    testCases.forEach((testCase, caseIndex) => {
        console.log(`\n📝 Test Case ${caseIndex + 1}: ${testCase.question.text}`);
        console.log(`Question Type: ${testCase.question.type}`);
        if (testCase.question.options) {
            console.log(`Options: ${testCase.question.options.join(', ')}`);
        }
        
        testCase.userResponses.forEach((response, responseIndex) => {
            console.log(`\n  Response ${responseIndex + 1}: "${response}"`);
            
            try {
                const processed = sessionService.processShortAnswer(response, testCase.question);
                console.log(`    Processed:`, JSON.stringify(processed, null, 4));
                
                if (processed.needsClarification) {
                    console.log(`    ❌ Needs Clarification: ${processed.clarificationMessage}`);
                } else {
                    console.log(`    ✅ Accepted: "${processed.answer}"`);
                }
            } catch (error) {
                console.log(`    ❌ Error: ${error.message}`);
            }
        });
    });

    // Test specific scenarios
    console.log('\n\n🔍 Specific Debug Scenarios');
    
    // Test 1: Multiple choice with common variations
    const diagnosisQuestion = {
        id: 'diagnosis',
        text: 'What is the primary diagnosis for this patient?',
        type: 'multiple_choice',
        options: ['Rheumatoid Arthritis', 'Psoriatic Arthritis', 'Ankylosing Spondylitis', 'Crohn\'s Disease', 'Ulcerative Colitis', 'Psoriasis', 'Other']
    };

    const commonResponses = [
        'rheumatoid arthritis',
        'rheumatoid',
        'arthritis',
        'rheumatoid arthritis disease',
        'the patient has rheumatoid arthritis',
        'it is rheumatoid arthritis',
        'yes rheumatoid arthritis',
        'rheumatoid arthritis please',
        'r a',
        'rheumatoid a',
        'rheumatoid arth',
        'rheumatoid arthritis for this patient'
    ];

    console.log('\n📝 Multiple Choice Debug:');
    commonResponses.forEach(response => {
        const processed = sessionService.processShortAnswer(response, diagnosisQuestion);
        console.log(`"${response}" -> ${processed.needsClarification ? '❌ Clarification needed' : `✅ "${processed.answer}"`}`);
    });

    // Test 2: Yes/No variations
    const yesNoQuestion = {
        id: 'step_1_required',
        text: 'Has the patient tried required step 1 medications?',
        type: 'yes_no'
    };

    const yesNoResponses = [
        'yes',
        'no',
        'yeah',
        'nope',
        'sure',
        'absolutely',
        'definitely not',
        'they have tried methotrexate',
        'patient tried methotrexate',
        'yes they have',
        'no they have not',
        'patient has not tried'
    ];

    console.log('\n📝 Yes/No Debug:');
    yesNoResponses.forEach(response => {
        const processed = sessionService.processShortAnswer(response, yesNoQuestion);
        console.log(`"${response}" -> ${processed.needsClarification ? '❌ Clarification needed' : `✅ "${processed.answer}"`}`);
    });

    // Test 3: Numeric variations
    const numericQuestion = {
        id: 'a1c_level',
        text: 'What is the patient\'s most recent A1C level?',
        type: 'numeric',
        validation: { range: { min: 6.5, max: 15 } }
    };

    const numericResponses = [
        'seven point two',
        '7.2',
        '7.2 percent',
        'the a1c is 7.2',
        'it is 7.2',
        'seven point two percent',
        'a1c level is 7.2',
        'patient a1c is 7.2 percent'
    ];

    console.log('\n📝 Numeric Debug:');
    numericResponses.forEach(response => {
        const processed = sessionService.processShortAnswer(response, numericQuestion);
        console.log(`"${response}" -> ${processed.needsClarification ? '❌ Clarification needed' : `✅ "${processed.answer}"`}`);
    });

    console.log('\n✅ Debug completed!');
    console.log('\n💡 Tips:');
    console.log('- If your response shows "❌ Clarification needed", the system is being too strict');
    console.log('- We can adjust the matching logic to be more lenient');
    console.log('- Common issues: extra words, different phrasing, transcription errors');
}

// Run the debug
debugTranscriptionIssue().catch(console.error); 