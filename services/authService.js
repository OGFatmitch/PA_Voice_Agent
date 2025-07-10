const sessionService = require('./sessionService');

class AuthService {
    constructor() {
        this.decisionMessages = {
            approve: {
                message: "Based on the information provided, I'm happy to inform you that this prior authorization has been approved. The medication will be covered according to your plan's formulary guidelines.",
                tone: "positive",
                nextSteps: "You can proceed with prescribing the medication. The approval is valid for the standard duration as outlined in your plan documents."
            },
            deny: {
                message: "I regret to inform you that this prior authorization request has been denied based on the clinical information provided.",
                tone: "professional",
                nextSteps: "You may submit additional clinical documentation for reconsideration, or discuss alternative treatment options with the patient."
            },
            documentation_required: {
                message: "I need additional clinical documentation to complete this prior authorization review.",
                tone: "helpful",
                nextSteps: "Please submit the requested documentation through your usual channels. Once received, we can complete the review process."
            }
        };
    }

    /**
     * Process the final authorization decision
     * @param {string} sessionId - Session identifier
     * @param {string} decision - Decision type (approve/deny/documentation_required)
     * @param {string} reason - Reason for decision
     * @returns {Object} - Decision details with message and next steps
     */
    processDecision(sessionId, decision, reason) {
        const session = sessionService.getSession(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        const decisionInfo = this.decisionMessages[decision];
        if (!decisionInfo) {
            throw new Error('Invalid decision type');
        }

        // Generate personalized message based on drug and context
        const personalizedMessage = this.generatePersonalizedMessage(
            decisionInfo.message,
            session,
            reason
        );

        return {
            decision,
            message: personalizedMessage,
            reason,
            nextSteps: decisionInfo.nextSteps,
            tone: decisionInfo.tone,
            sessionId,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Generate personalized decision message
     * @param {string} baseMessage - Base decision message
     * @param {Object} session - Session data
     * @param {string} reason - Decision reason
     * @returns {string} - Personalized message
     */
    generatePersonalizedMessage(baseMessage, session, reason) {
        let message = baseMessage;

        // Add drug-specific information
        if (session.drugName) {
            message = message.replace(
                "this prior authorization",
                `the prior authorization for ${session.drugName}`
            );
        }

        // Add member information if available
        if (session.memberName) {
            message = message.replace(
                "the medication",
                `${session.memberName}'s medication`
            );
        }

        // Add specific reason if provided
        if (reason && reason !== 'Based on clinical criteria evaluation') {
            message += ` The decision is based on: ${reason}.`;
        }

        return message;
    }

    /**
     * Validate session data completeness
     * @param {string} sessionId - Session identifier
     * @returns {Object} - Validation result
     */
    validateSessionData(sessionId) {
        const session = sessionService.getSession(sessionId);
        if (!session) {
            return { valid: false, errors: ['Session not found'] };
        }

        const errors = [];

        // Check required basic information
        if (!session.memberName) {
            errors.push('Member name is required');
        }

        if (!session.dateOfBirth) {
            errors.push('Date of birth is required');
        }

        if (!session.drugName) {
            errors.push('Drug name is required');
        }

        // Check if question flow was completed
        if (session.step === 'question_flow' && session.currentQuestionIndex < session.questionFlow.length) {
            errors.push('Question flow was not completed');
        }

        return {
            valid: errors.length === 0,
            errors,
            session: session
        };
    }

    /**
     * Get authorization summary for a session
     * @param {string} sessionId - Session identifier
     * @returns {Object} - Authorization summary
     */
    getAuthorizationSummary(sessionId) {
        const session = sessionService.getSession(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        const validation = this.validateSessionData(sessionId);
        
        return {
            sessionId,
            memberName: session.memberName,
            dateOfBirth: session.dateOfBirth,
            drugName: session.drugName,
            drugCategory: this.getDrugCategory(session.drugId),
            status: session.status,
            decision: session.decision,
            decisionReason: session.decisionReason,
            answers: session.answers,
            validation: validation,
            createdAt: session.createdAt,
            completedAt: session.endedAt || session.updatedAt
        };
    }

    /**
     * Get drug category information
     * @param {string} drugId - Drug identifier
     * @returns {Object|null} - Drug category information
     */
    getDrugCategory(drugId) {
        if (!drugId) return null;

        const drug = sessionService.drugsData?.drugs.find(d => d.id === drugId);
        if (!drug) return null;

        return {
            category: drug.category,
            indication: drug.indication,
            requiresAuth: drug.requiresAuth
        };
    }

    /**
     * Generate authorization report
     * @param {string} sessionId - Session identifier
     * @returns {Object} - Authorization report
     */
    generateReport(sessionId) {
        const summary = this.getAuthorizationSummary(sessionId);
        const session = sessionService.getSession(sessionId);

        const report = {
            reportId: `AUTH-${sessionId.substring(0, 8).toUpperCase()}`,
            generatedAt: new Date().toISOString(),
            summary: summary,
            questionResponses: this.formatQuestionResponses(session),
            clinicalCriteria: this.getClinicalCriteria(session),
            recommendations: this.generateRecommendations(summary)
        };

        return report;
    }

    /**
     * Format question responses for report
     * @param {Object} session - Session data
     * @returns {Array} - Formatted question responses
     */
    formatQuestionResponses(session) {
        const responses = [];
        
        if (session.questionFlow && session.answers) {
            session.questionFlow.forEach((question, index) => {
                if (session.answers[question.id]) {
                    responses.push({
                        questionNumber: index + 1,
                        question: question.text,
                        answer: session.answers[question.id],
                        questionType: question.type,
                        required: question.required
                    });
                }
            });
        }

        return responses;
    }

    /**
     * Get clinical criteria met/not met
     * @param {Object} session - Session data
     * @returns {Object} - Clinical criteria assessment
     */
    getClinicalCriteria(session) {
        const criteria = {
            diagnosis: null,
            severity: null,
            duration: null,
            previousTherapy: null,
            contraindications: null
        };

        if (session.answers) {
            if (session.answers.diagnosis) {
                criteria.diagnosis = {
                    value: session.answers.diagnosis,
                    met: this.isDiagnosisAppropriate(session.answers.diagnosis, session.drugId)
                };
            }

            if (session.answers.a1c_level) {
                criteria.severity = {
                    value: session.answers.a1c_level,
                    met: parseFloat(session.answers.a1c_level) >= 6.5
                };
            }

            if (session.answers.bmi_level) {
                criteria.severity = {
                    value: session.answers.bmi_level,
                    met: parseFloat(session.answers.bmi_level) >= 30
                };
            }

            if (session.answers.step_1_required || session.answers.conventional_therapy) {
                criteria.previousTherapy = {
                    value: session.answers.step_1_required || session.answers.conventional_therapy,
                    met: (session.answers.step_1_required === 'yes' || session.answers.conventional_therapy === 'yes')
                };
            }

            if (session.answers.contraindications) {
                criteria.contraindications = {
                    value: session.answers.contraindications,
                    met: session.answers.contraindications === 'no'
                };
            }
        }

        return criteria;
    }

    /**
     * Check if diagnosis is appropriate for the drug
     * @param {string} diagnosis - Patient diagnosis
     * @param {string} drugId - Drug identifier
     * @returns {boolean} - Whether diagnosis is appropriate
     */
    isDiagnosisAppropriate(diagnosis, drugId) {
        const drug = sessionService.drugsData?.drugs.find(d => d.id === drugId);
        if (!drug) return false;

        const indication = drug.indication.toLowerCase();
        const diagnosisLower = diagnosis.toLowerCase();

        return indication.includes(diagnosisLower) || diagnosisLower.includes(indication);
    }

    /**
     * Generate recommendations based on authorization result
     * @param {Object} summary - Authorization summary
     * @returns {Array} - Recommendations
     */
    generateRecommendations(summary) {
        const recommendations = [];

        if (summary.decision === 'approve') {
            recommendations.push({
                type: 'monitoring',
                message: 'Monitor patient response and adherence to therapy',
                priority: 'medium'
            });
            recommendations.push({
                type: 'follow_up',
                message: 'Schedule follow-up to assess treatment effectiveness',
                priority: 'medium'
            });
        } else if (summary.decision === 'deny') {
            recommendations.push({
                type: 'alternative',
                message: 'Consider alternative treatment options within formulary',
                priority: 'high'
            });
            recommendations.push({
                type: 'appeal',
                message: 'Submit additional clinical documentation for reconsideration if appropriate',
                priority: 'medium'
            });
        } else if (summary.decision === 'documentation_required') {
            recommendations.push({
                type: 'documentation',
                message: 'Submit requested clinical documentation promptly',
                priority: 'high'
            });
        }

        return recommendations;
    }
}

module.exports = new AuthService(); 