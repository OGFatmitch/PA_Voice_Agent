const sessionService = require('./services/sessionService');
const voiceService = require('./services/voiceService');

async function testShortResponseProcessing() {
    console.log('🧪 Testing Enhanced Short Response Processing\n');

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 1: Very short responses in question flow
    console.log('📝 Test 1: Very short responses in question flow');
    const session1 = sessionService.createSession();
    console.log('Session created:', session1);
    
    // Initialize with a drug to start question flow
    sessionService.updateSession(session1, {
        memberName: 'John Smith',
        dateOfBirth: '03/15/1985',
        drugName: 'Humira'
    });
    
    // Find the drug and initialize question flow
    const drug = sessionService.findDrug('Humira');
    if (drug) {
        sessionService.initializeQuestionFlow(session1, drug.id);
        console.log('Question flow initialized for:', drug.name);
        
        const shortInputs = ['', 'hi', 'yes', 'no', 'maybe', 'okay'];
        
        for (const input of shortInputs) {
            console.log(`\nInput: "${input}"`);
            try {
                const result = sessionService.processAnswer(session1, input);
                console.log('Result:', JSON.stringify(result, null, 2));
            } catch (error) {
                console.log('Error:', error.message);
            }
        }
    }

    // Test 2: Yes/No variations in question flow
    console.log('\n\n📝 Test 2: Yes/No variations in question flow');
    const session2 = sessionService.createSession();
    
    // Initialize with a drug to start question flow
    sessionService.updateSession(session2, {
        memberName: 'Jane Doe',
        dateOfBirth: '01/10/1990',
        drugName: 'Ozempic'
    });
    
    const drug2 = sessionService.findDrug('Ozempic');
    if (drug2) {
        sessionService.initializeQuestionFlow(session2, drug2.id);
        console.log('Question flow initialized for:', drug2.name);
        
        const yesNoInputs = ['yes', 'y', 'yeah', 'yep', 'sure', 'no', 'n', 'nope', 'nah', 'maybe', 'okay'];
        
        for (const input of yesNoInputs) {
            console.log(`\nInput: "${input}"`);
            try {
                const result = sessionService.processAnswer(session2, input);
                console.log('Result:', JSON.stringify(result, null, 2));
            } catch (error) {
                console.log('Error:', error.message);
            }
        }
    }

    // Test 3: Multiple choice variations
    console.log('\n\n📝 Test 3: Multiple choice variations');
    const session3 = sessionService.createSession();
    
    // Initialize with a drug to start question flow
    sessionService.updateSession(session3, {
        memberName: 'Bob Johnson',
        dateOfBirth: '07/22/1972',
        drugName: 'Wegovy'
    });
    
    const drug3 = sessionService.findDrug('Wegovy');
    if (drug3) {
        sessionService.initializeQuestionFlow(session3, drug3.id);
        console.log('Question flow initialized for:', drug3.name);
        
        const choiceInputs = ['type 2 diabetes', 'type 2', 'diabetes', 'type 1', 'other', 'gestational'];
        
        for (const input of choiceInputs) {
            console.log(`\nInput: "${input}"`);
            try {
                const result = sessionService.processAnswer(session3, input);
                console.log('Result:', JSON.stringify(result, null, 2));
            } catch (error) {
                console.log('Error:', error.message);
            }
        }
    }

    // Test 4: Greeting step with short inputs
    console.log('\n\n📝 Test 4: Greeting step processing');
    const session4 = sessionService.createSession();
    
    const greetingInputs = [
        'john smith',
        '03/15/1985',
        'humira',
        'john',
        'smith',
        'john smith 03/15/1985 humira'
    ];
    
    for (const input of greetingInputs) {
        console.log(`\nInput: "${input}"`);
        try {
            // Simulate greeting step processing
            const processedInput = processShortGreetingInput(input);
            console.log('Processed input:', JSON.stringify(processedInput, null, 2));
        } catch (error) {
            console.log('Error:', error.message);
        }
    }

    // Test 5: Test the enhanced answer processing methods directly
    console.log('\n\n📝 Test 5: Direct method testing');
    
    // Test yes/no processing
    console.log('\nYes/No processing:');
    const yesNoTest = sessionService.processYesNoAnswer('yeah', { type: 'yes_no' });
    console.log('Input: "yeah" ->', JSON.stringify(yesNoTest, null, 2));
    
    const yesNoTest2 = sessionService.processYesNoAnswer('maybe', { type: 'yes_no' });
    console.log('Input: "maybe" ->', JSON.stringify(yesNoTest2, null, 2));
    
    // Test multiple choice processing
    console.log('\nMultiple choice processing:');
    const mcTest = sessionService.processMultipleChoiceAnswer('type 2', { 
        type: 'multiple_choice',
        options: ['Type 1 Diabetes', 'Type 2 Diabetes', 'Gestational Diabetes', 'Other']
    });
    console.log('Input: "type 2" ->', JSON.stringify(mcTest, null, 2));
    
    const mcTest2 = sessionService.processMultipleChoiceAnswer('diabetes', { 
        type: 'multiple_choice',
        options: ['Type 1 Diabetes', 'Type 2 Diabetes', 'Gestational Diabetes', 'Other']
    });
    console.log('Input: "diabetes" ->', JSON.stringify(mcTest2, null, 2));

    console.log('\n✅ Short response processing tests completed!');
}

// Helper function for greeting step processing (simplified version)
function processShortGreetingInput(userInput) {
    const normalizedInput = userInput.toLowerCase().trim();
    
    if (!normalizedInput || normalizedInput.length < 3) {
        return {
            processedInput: userInput,
            needsClarification: true,
            clarificationMessage: "I didn't quite catch that. Could you please provide the patient's name, date of birth, and the medication you're requesting?"
        };
    }
    
    const hasName = /(?:name|called|patient|member)/i.test(normalizedInput);
    const hasDate = /(?:born|birth|dob|date)/i.test(normalizedInput);
    const hasDrug = /(?:drug|medication|prescribing|requesting|need|want)/i.test(normalizedInput);
    
    if (normalizedInput.length < 10 && !hasName && !hasDate && !hasDrug) {
        return {
            processedInput: userInput,
            needsClarification: true,
            clarificationMessage: "I need more information to help you. Could you please provide the patient's name, date of birth, and the medication you're requesting?"
        };
    }
    
    if (normalizedInput.split(' ').length === 1 && normalizedInput.length > 2) {
        return {
            processedInput: userInput,
            needsClarification: true,
            clarificationMessage: `Thank you for providing "${userInput}". I also need the patient's date of birth and the medication you're requesting.`
        };
    }
    
    return {
        processedInput: userInput,
        needsClarification: false
    };
}

// Run the tests
testShortResponseProcessing().catch(console.error); 