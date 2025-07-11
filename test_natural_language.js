const sessionService = require('./services/sessionService');
const voiceService = require('./services/voiceService');

async function testNaturalLanguageFeatures() {
    console.log('🎭 Testing Enhanced Natural Language Features\n');

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 1: Conversation Memory
    console.log('📝 Test 1: Conversation Memory');
    const session1 = sessionService.createSession();
    console.log('Session created:', session1);
    
    // Simulate a conversation
    const conversation = [
        { speaker: 'assistant', message: "Hi, I'm Casey from CVS Health. I'm here to help you with your prior authorization request. To get started, I'll need some basic information about the patient and the medication. Could you please provide the patient's full name?" },
        { speaker: 'user', message: "The patient's name is John Smith" },
        { speaker: 'assistant', message: "Thanks. Now I need the patient's date of birth. What is the patient's date of birth?" },
        { speaker: 'user', message: "March 15, 1985" },
        { speaker: 'assistant', message: "Thanks. What medication are you requesting authorization for?" },
        { speaker: 'user', message: "Humira" }
    ];
    
    // Add conversation turns
    conversation.forEach(turn => {
        sessionService.addConversationTurn(session1, turn.speaker, turn.message);
    });
    
    // Get conversation context
    const context = sessionService.buildConversationContext(session1);
    console.log('Conversation context:', JSON.stringify(context, null, 2));
    
    // Get conversation summary
    const summary = sessionService.getConversationSummary(session1);
    console.log('Conversation summary:', summary);

    // Test 2: Natural Language Patterns
    console.log('\n\n📝 Test 2: Natural Language Patterns');
    
    const testResponses = [
        { text: "I found Humira in our system. Now I need to ask you some clinical questions.", context: { isConfirmation: false } },
        { text: "So you're requesting Humira for rheumatoid arthritis, correct?", context: { isConfirmation: true } },
        { text: "I've completed all the necessary questions. Let me process your authorization request.", context: { action: 'complete' } },
        { text: "Let me check on that for you.", context: { action: 'checking' } }
    ];
    
    testResponses.forEach((test, index) => {
        console.log(`\nTest ${index + 1}:`);
        console.log('Original:', test.text);
        const enhanced = voiceService.addNaturalLanguagePatterns(test.text, test.context);
        console.log('Enhanced:', enhanced);
    });

    // Test 3: SSML Conversion
    console.log('\n\n📝 Test 3: SSML Conversion');
    
    const testTexts = [
        "Sure, I found Humira in our system. The patient has rheumatoid arthritis.",
        "Thanks for that. The A1C level is 7.2 percent.",
        "I've submitted the prior authorization request and it's now pending approval."
    ];
    
    testTexts.forEach((text, index) => {
        console.log(`\nTest ${index + 1}:`);
        console.log('Original:', text);
        const ssml = voiceService.convertToSSML(text);
        console.log('SSML:', ssml);
    });

    // Test 4: Enhanced System Prompt
    console.log('\n\n📝 Test 4: Enhanced System Prompt');
    
    const context2 = {
        memberName: 'Jane Doe',
        dateOfBirth: '01/10/1990',
        drugName: 'Ozempic',
        currentStep: 'question_flow',
        currentQuestion: 'What is the primary diagnosis for this patient?',
        questionOptions: ['Type 2 Diabetes', 'Type 1 Diabetes', 'Obesity', 'Other']
    };
    
    const systemPrompt = voiceService.buildSystemPrompt(context2);
    console.log('Enhanced System Prompt:');
    console.log(systemPrompt);

    // Test 5: Natural Clarification Messages
    console.log('\n\n📝 Test 5: Natural Clarification Messages');
    
    const clarificationTests = [
        { issueType: 'too_short', question: { type: 'text' } },
        { issueType: 'unclear_yes_no', question: { type: 'yes_no' } },
        { issueType: 'multiple_matches', question: { type: 'multiple_choice' }, additionalData: ['Type 1 Diabetes', 'Type 2 Diabetes'] },
        { issueType: 'not_numeric', question: { type: 'numeric' } },
        { issueType: 'out_of_range', question: { type: 'numeric' }, additionalData: { min: 6.5, max: 15, value: 5.0 } }
    ];
    
    clarificationTests.forEach((test, index) => {
        console.log(`\nTest ${index + 1} (${test.issueType}):`);
        const message = sessionService.getClarificationMessage(test.question, test.issueType, test.additionalData);
        console.log(message);
    });

    console.log('\n✅ Natural language features test completed!');
}

// Run the tests
testNaturalLanguageFeatures().catch(console.error); 