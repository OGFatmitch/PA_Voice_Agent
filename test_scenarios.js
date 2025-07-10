const sessionService = require('./services/sessionService');
const authService = require('./services/authService');

// Test scenarios for all 15 drugs
const testScenarios = [
    // 1. Ozempic - Approved pathway
    {
        name: "Ozempic - Approved",
        drug: "ozempic",
        answers: [
            "Type 2 Diabetes",
            "7.5",
            "yes",
            "metformin",
            "yes",
            "Patient failed metformin due to gastrointestinal side effects after 3 months",
            "no"
        ],
        expectedDecision: "approve"
    },
    // 2. Ozempic - Denied (Type 1 Diabetes)
    {
        name: "Ozempic - Denied (Type 1 Diabetes)",
        drug: "ozempic",
        answers: [
            "Type 1 Diabetes"
        ],
        expectedDecision: "deny"
    },
    // 3. Mounjaro - Approved pathway
    {
        name: "Mounjaro - Approved",
        drug: "mounjaro",
        answers: [
            "Type 2 Diabetes",
            "8.2",
            "yes",
            "metformin and glipizide",
            "yes",
            "Patient failed both metformin and glipizide due to inadequate glycemic control",
            "no"
        ],
        expectedDecision: "approve"
    },
    // 4. Humira - Approved (Rheumatoid Arthritis)
    {
        name: "Humira - Approved (RA)",
        drug: "humira",
        answers: [
            "Rheumatoid Arthritis",
            "More than 2 years",
            "yes",
            "Methotrexate and prednisone",
            "yes",
            "Patient failed methotrexate due to liver toxicity and prednisone due to side effects",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 5. Humira - Denied (Insufficient duration)
    {
        name: "Humira - Denied (Insufficient duration)",
        drug: "humira",
        answers: [
            "Rheumatoid Arthritis",
            "Less than 6 months"
        ],
        expectedDecision: "deny"
    },
    // 6. Stelara - Approved (Psoriasis)
    {
        name: "Stelara - Approved (Psoriasis)",
        drug: "stelara",
        answers: [
            "Psoriasis",
            "Severe (more than 10% body surface area)",
            "yes",
            "Topical steroids and phototherapy",
            "yes",
            "Patient failed topical steroids and phototherapy due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 7. Skyrizi - Approved (Psoriasis)
    {
        name: "Skyrizi - Approved (Psoriasis)",
        drug: "skyrizi",
        answers: [
            "Psoriasis",
            "Moderate (3-10% body surface area)",
            "yes",
            "Topical treatments and methotrexate",
            "yes",
            "Patient failed topical treatments and methotrexate due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 8. Dupixent - Approved (Atopic Dermatitis)
    {
        name: "Dupixent - Approved (Atopic Dermatitis)",
        drug: "dupixent",
        answers: [
            "Atopic Dermatitis",
            "Severe",
            "yes",
            "Topical steroids and calcineurin inhibitors",
            "yes",
            "Patient failed topical steroids and calcineurin inhibitors due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 9. Rinvoq - Approved (RA)
    {
        name: "Rinvoq - Approved (RA)",
        drug: "rinvoq",
        answers: [
            "Rheumatoid Arthritis",
            "More than 2 years",
            "yes",
            "Methotrexate and leflunomide",
            "yes",
            "Patient failed methotrexate and leflunomide due to inadequate response",
            "45",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 10. Xeljanz - Denied (Age restriction)
    {
        name: "Xeljanz - Denied (Age restriction)",
        drug: "xeljanz",
        answers: [
            "Rheumatoid Arthritis",
            "More than 2 years",
            "yes",
            "Methotrexate",
            "yes",
            "Patient failed methotrexate",
            "70"
        ],
        expectedDecision: "deny"
    },
    // 11. Cosentyx - Approved (Psoriasis)
    {
        name: "Cosentyx - Approved (Psoriasis)",
        drug: "cosentyx",
        answers: [
            "Psoriasis",
            "Severe (more than 10% body surface area)",
            "yes",
            "Topical steroids and methotrexate",
            "yes",
            "Patient failed topical steroids and methotrexate due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 12. Taltz - Approved (Psoriatic Arthritis)
    {
        name: "Taltz - Approved (PsA)",
        drug: "taltz",
        answers: [
            "Psoriatic Arthritis",
            "More than 2 years",
            "yes",
            "Methotrexate and NSAIDs",
            "yes",
            "Patient failed methotrexate and NSAIDs due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 13. Tremfya - Approved (Psoriasis)
    {
        name: "Tremfya - Approved (Psoriasis)",
        drug: "tremfya",
        answers: [
            "Psoriasis",
            "Moderate (3-10% body surface area)",
            "yes",
            "Topical treatments and phototherapy",
            "yes",
            "Patient failed topical treatments and phototherapy due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 14. Entyvio - Approved (Crohn's Disease)
    {
        name: "Entyvio - Approved (Crohn's)",
        drug: "entyvio",
        answers: [
            "Crohn's Disease",
            "More than 2 years",
            "Moderate",
            "yes",
            "Prednisone and azathioprine",
            "yes",
            "Patient failed prednisone and azathioprine due to inadequate response",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    },
    // 15. Rinvoq IBD - Approved (Ulcerative Colitis)
    {
        name: "Rinvoq IBD - Approved (UC)",
        drug: "rinvoq_ibd",
        answers: [
            "Ulcerative Colitis",
            "More than 2 years",
            "Moderate",
            "yes",
            "Mesalamine and prednisone",
            "yes",
            "Patient failed mesalamine and prednisone due to inadequate response",
            "35",
            "yes",
            "Negative for TB and other infections"
        ],
        expectedDecision: "approve"
    }
];

async function runAllScenarios() {
    console.log('🧪 Running All 15 Drug Scenarios...\n');

    // Wait for data to load
    while (!sessionService.dataLoaded) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < testScenarios.length; i++) {
        const scenario = testScenarios[i];
        console.log(`${i + 1}. Testing: ${scenario.name}`);
        
        try {
            // Create session
            const sessionId = sessionService.createSession();
            
            // Find drug
            const drug = sessionService.findDrug(scenario.drug);
            if (!drug) {
                console.log(`   ❌ Drug not found: ${scenario.drug}`);
                failed++;
                continue;
            }

            // Initialize question flow
            sessionService.initializeQuestionFlow(sessionId, drug.id);
            sessionService.updateSession(sessionId, { drugName: drug.name });

            // Process answers
            let result = null;
            for (const answer of scenario.answers) {
                result = sessionService.processAnswer(sessionId, answer);
                if (result.action === 'complete') {
                    break;
                }
            }

            // Check result
            if (result && result.decision === scenario.expectedDecision) {
                console.log(`   ✅ PASSED - Decision: ${result.decision}`);
                passed++;
            } else {
                console.log(`   ❌ FAILED - Expected: ${scenario.expectedDecision}, Got: ${result ? result.decision : 'undefined'}`);
                failed++;
            }

        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('🎉 All scenarios passed!');
    } else {
        console.log('⚠️  Some scenarios failed. Check the output above.');
    }
}

// Run scenarios if this file is executed directly
if (require.main === module) {
    runAllScenarios();
}

module.exports = { runAllScenarios, testScenarios }; 