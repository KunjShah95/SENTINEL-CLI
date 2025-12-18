import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Team Annotations System for Sentinel
 * Allows collaborative issue management with comments, assignments, and suppressions
 */
export class TeamAnnotations {
    constructor(annotationsDir = '.sentinel') {
        this.annotationsDir = annotationsDir;
        this.annotationsFile = path.join(annotationsDir, 'annotations.json');
        this.suppressionsFile = path.join(annotationsDir, 'suppressions.json');
        this.assignmentsFile = path.join(annotationsDir, 'assignments.json');
        this.annotations = new Map();
        this.suppressions = new Map();
        this.assignments = new Map();
    }

    /**
     * Initialize annotations system
     */
    async initialize() {
        try {
            await fs.mkdir(this.annotationsDir, { recursive: true });
            await this.loadAnnotations();
            await this.loadSuppressions();
            await this.loadAssignments();
            console.log('✅ Team annotations initialized');
        } catch (error) {
            console.warn('⚠️ Team annotations initialization failed:', error.message);
        }
    }

    /**
     * Load existing annotations
     */
    async loadAnnotations() {
        try {
            const content = await fs.readFile(this.annotationsFile, 'utf8');
            const data = JSON.parse(content);

            // Convert to Maps for efficient lookup
            this.annotations = new Map(Object.entries(data.annotations || {}));
            console.log(`📝 Loaded ${this.annotations.size} annotations`);
        } catch (error) {
            this.annotations = new Map();
        }
    }

    /**
     * Load suppressions
     */
    async loadSuppressions() {
        try {
            const content = await fs.readFile(this.suppressionsFile, 'utf8');
            const data = JSON.parse(content);

            this.suppressions = new Map(Object.entries(data.suppressions || {}));
            console.log(`🔇 Loaded ${this.suppressions.size} suppressions`);
        } catch (error) {
            this.suppressions = new Map();
        }
    }

    /**
     * Load assignments
     */
    async loadAssignments() {
        try {
            const content = await fs.readFile(this.assignmentsFile, 'utf8');
            const data = JSON.parse(content);

            this.assignments = new Map(Object.entries(data.assignments || {}));
            console.log(`👥 Loaded ${this.assignments.size} assignments`);
        } catch (error) {
            this.assignments = new Map();
        }
    }

    /**
     * Add annotation to an issue
     */
    async addAnnotation(issueId, annotation) {
        const annotationId = this.generateAnnotationId();
        const annotationData = {
            id: annotationId,
            issueId,
            ...annotation,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            author: annotation.author || 'unknown',
            status: annotation.status || 'open',
        };

        this.annotations.set(annotationId, annotationData);
        await this.saveAnnotations();

        return {
            success: true,
            annotationId,
            annotation: annotationData,
        };
    }

    /**
     * Add comment to issue
     */
    async addComment(issueId, comment, options = {}) {
        const annotationId = this.generateAnnotationId();
        const commentData = {
            id: annotationId,
            issueId,
            type: 'comment',
            content: comment.content,
            author: comment.author || options.author || 'unknown',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            visibility: comment.visibility || 'team',
            reactions: comment.reactions || [],
            replies: comment.replies || [],
            status: 'active',
            metadata: comment.metadata || {},
        };

        this.annotations.set(annotationId, commentData);
        await this.saveAnnotations();

        return {
            success: true,
            annotationId,
            comment: commentData,
        };
    }

    /**
     * Assign issue to team member
     */
    async assignIssue(issueId, assignment, _options = {}) {
        const assignmentId = this.generateAssignmentId();
        const assignmentData = {
            id: assignmentId,
            issueId,
            assignee: assignment.assignee,
            assignedBy: assignment.assignedBy || 'system',
            assignedAt: new Date().toISOString(),
            status: assignment.status || 'assigned',
            priority: assignment.priority || 'medium',
            estimatedHours: assignment.estimatedHours || null,
            dueDate: assignment.dueDate || null,
            description: assignment.description || '',
            tags: assignment.tags || [],
        };

        this.assignments.set(`${issueId}:${assignment.assignee}`, assignmentData);
        await this.saveAssignments();

        return {
            success: true,
            assignmentId,
            assignment: assignmentData,
        };
    }

    /**
     * Suppress issue as false positive
     */
    async suppressIssue(issueId, suppression, options = {}) {
        const suppressionId = this.generateSuppressionId();
        const suppressionData = {
            id: suppressionId,
            issueId,
            reason: suppression.reason || 'False positive',
            suppressor: suppression.suppressor || options.suppressor || 'unknown',
            suppressedAt: new Date().toISOString(),
            status: suppression.status || 'active',
            expiresAt: suppression.expiresAt || null,
            scope: suppression.scope || 'specific',
            evidence: suppression.evidence || '',
            metadata: suppression.metadata || {},
        };

        this.suppressions.set(suppressionId, suppressionData);
        await this.saveSuppressions();

        return {
            success: true,
            suppressionId,
            suppression: suppressionData,
        };
    }

    /**
     * Acknowledge issue
     */
    async acknowledgeIssue(issueId, acknowledgment, options = {}) {
        const annotationId = this.generateAnnotationId();
        const acknowledgmentData = {
            id: annotationId,
            issueId,
            type: 'acknowledgment',
            acknowledgedBy: acknowledgment.acknowledgedBy || options.acknowledgedBy || 'unknown',
            acknowledgedAt: new Date().toISOString(),
            status: acknowledgment.status || 'acknowledged',
            severity: acknowledgment.severity || 'medium',
            impact: acknowledgment.impact || 'investigate',
            actionItems: acknowledgment.actionItems || [],
            metadata: acknowledgment.metadata || {},
        };

        this.annotations.set(annotationId, acknowledgmentData);
        await this.saveAnnotations();

        return {
            success: true,
            annotationId,
            acknowledgment: acknowledgmentData,
        };
    }

    /**
     * Get annotations for issue
     */
    getIssueAnnotations(issueId) {
        const annotations = [];

        for (const annotation of this.annotations.values()) {
            if (annotation.issueId === issueId) {
                annotations.push(annotation);
            }
        }

        // Sort by creation date
        annotations.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        return annotations;
    }

    /**
     * Get assignments for issue
     */
    getIssueAssignments(issueId) {
        const assignments = [];

        for (const [key, assignment] of this.assignments) {
            const [assignmentIssueId] = key.split(':');
            if (assignmentIssueId === issueId) {
                assignments.push(assignment);
            }
        }

        // Sort by assignment date
        assignments.sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt));

        return assignments;
    }

    /**
     * Check if issue is suppressed
     */
    isIssueSuppressed(issueId) {
        for (const suppression of this.suppressions.values()) {
            if (suppression.issueId === issueId) {
                // Check if suppression is still active
                if (!suppression.expiresAt || new Date(suppression.expiresAt) > new Date()) {
                    return {
                        suppressed: true,
                        suppression,
                        reason: suppression.reason,
                    };
                }
            }
        }

        return { suppressed: false };
    }

    /**
     * Get team member workload
     */
    getTeamWorkload(teamMember = null) {
        const workload = {
            assignedIssues: 0,
            byPriority: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
            },
            byStatus: {
                assigned: 0,
                in_progress: 0,
                completed: 0,
                blocked: 0,
            },
            estimatedHours: 0,
            overdueIssues: 0,
        };

        for (const [key, assignment] of this.assignments) {
            const [, assignee] = key.split(':');

            // Filter by team member if specified
            if (teamMember && assignee !== teamMember) {
                continue;
            }

            workload.assignedIssues++;

            // Count by priority
            if (workload.byPriority[assignment.priority] !== undefined) {
                workload.byPriority[assignment.priority]++;
            }

            // Count by status
            if (workload.byStatus[assignment.status] !== undefined) {
                workload.byStatus[assignment.status]++;
            }

            // Add estimated hours
            if (assignment.estimatedHours) {
                workload.estimatedHours += assignment.estimatedHours;
            }

            // Check for overdue issues
            if (assignment.dueDate && new Date(assignment.dueDate) < new Date()) {
                workload.overdueIssues++;
            }
        }

        return workload;
    }

    /**
     * Get team statistics
     */
    getTeamStats() {
        const stats = {
            totalAnnotations: this.annotations.size,
            totalSuppressions: this.suppressions.size,
            totalAssignments: this.assignments.size,
            annotationsByType: {},
            suppressionsByScope: {},
            assignmentsByStatus: {},
            activeMembers: new Set(),
            recentlyActive: [],
        };

        // Count annotations by type
        for (const annotation of this.annotations.values()) {
            stats.annotationsByType[annotation.type] =
                (stats.annotationsByType[annotation.type] || 0) + 1;
        }

        // Count suppressions by scope
        for (const suppression of this.suppressions.values()) {
            stats.suppressionsByScope[suppression.scope] =
                (stats.suppressionsByScope[suppression.scope] || 0) + 1;
        }

        // Count assignments by status
        for (const assignment of this.assignments.values()) {
            stats.assignmentsByStatus[assignment.status] =
                (stats.assignmentsByStatus[assignment.status] || 0) + 1;

            if (assignment.status === 'assigned' || assignment.status === 'in_progress') {
                stats.activeMembers.add(assignment.assignee);
            }
        }

        // Get recently active (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        for (const assignment of this.assignments.values()) {
            if (new Date(assignment.assignedAt) > sevenDaysAgo) {
                stats.recentlyActive.push({
                    assignee: assignment.assignee,
                    issueId: assignment.issueId,
                    assignedAt: assignment.assignedAt,
                    priority: assignment.priority,
                });
            }
        }

        return stats;
    }

    /**
     * Export annotations data
     */
    async exportData(format = 'json', outputPath) {
        const exportData = {
            annotations: Object.fromEntries(this.annotations),
            suppressions: Object.fromEntries(this.suppressions),
            assignments: Object.fromEntries(this.assignments),
            statistics: this.getTeamStats(),
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
        };

        let content;
        let extension;

        switch (format.toLowerCase()) {
            case 'json':
                content = JSON.stringify(exportData, null, 2);
                extension = '.json';
                break;
            case 'csv':
                content = this.convertToCSV(exportData);
                extension = '.csv';
                break;
            case 'markdown':
                content = this.convertToMarkdown(exportData);
                extension = '.md';
                break;
            default:
                content = JSON.stringify(exportData, null, 2);
                extension = '.json';
        }

        const defaultPath = path.join(this.annotationsDir, `annotations-export${extension}`);
        const finalPath = outputPath || defaultPath;

        await fs.writeFile(finalPath, content, 'utf8');

        return {
            success: true,
            outputPath: finalPath,
            format,
            recordCount: this.annotations.size + this.suppressions.size + this.assignments.size,
        };
    }

    /**
     * Convert to CSV format
     */
    convertToCSV(data) {
        const lines = [];

        // Annotations CSV
        lines.push('Type,ID,Issue ID,Author,Content,Created At,Status');
        for (const annotation of data.annotations.values()) {
            lines.push([
                annotation.type,
                annotation.id,
                annotation.issueId,
                annotation.author,
                `"${(annotation.content || '').replace(/"/g, '""')}"`,
                annotation.createdAt,
                annotation.status,
            ].join(','));
        }

        // Suppressions CSV
        lines.push('');
        lines.push('Type,ID,Issue ID,Suppressor,Reason,Suppressed At,Expires At,Scope');
        for (const suppression of data.suppressions.values()) {
            lines.push([
                'suppression',
                suppression.id,
                suppression.issueId,
                suppression.suppressor,
                `"${(suppression.reason || '').replace(/"/g, '""')}"`,
                suppression.suppressedAt,
                suppression.expiresAt || '',
                suppression.scope,
            ].join(','));
        }

        // Assignments CSV
        lines.push('');
        lines.push('Type,ID,Issue ID,Assignee,Assigned By,Assigned At,Status,Priority,Est. Hours,Due Date');
        for (const assignment of data.assignments.values()) {
            const [, issueId] = assignment.id.split(':');
            lines.push([
                'assignment',
                assignment.id,
                issueId,
                assignment.assignee,
                assignment.assignedBy,
                assignment.assignedAt,
                assignment.status,
                assignment.priority,
                assignment.estimatedHours || '',
                assignment.dueDate || '',
            ].join(','));
        }

        return lines.join('\n');
    }

    /**
     * Convert to Markdown format
     */
    convertToMarkdown(data) {
        let markdown = '# Team Annotations Report\n\n';
        markdown += `**Generated:** ${new Date().toISOString()}\n\n`;

        // Statistics
        const stats = data.statistics;
        markdown += '## 📊 Statistics\n\n';
        markdown += `- **Total Annotations:** ${stats.totalAnnotations}\n`;
        markdown += `- **Total Suppressions:** ${stats.totalSuppressions}\n`;
        markdown += `- **Total Assignments:** ${stats.totalAssignments}\n`;
        markdown += `- **Active Team Members:** ${stats.activeMembers.size}\n\n`;

        // Recent activity
        if (stats.recentlyActive.length > 0) {
            markdown += '## 🕐 Recent Activity (Last 7 Days)\n\n';
            for (const activity of stats.recentlyActive.slice(0, 5)) {
                markdown += `**${activity.assignee}** assigned issue ${activity.issueId} on ${new Date(activity.assignedAt).toLocaleDateString()}\n`;
            }
            markdown += '\n';
        }

        // Active assignments
        const activeAssignments = Array.from(data.assignments.values())
            .filter(a => a.status === 'assigned' || a.status === 'in_progress');

        if (activeAssignments.length > 0) {
            markdown += '## 📋 Active Assignments\n\n';
            markdown += '| Assignee | Issue ID | Priority | Assigned Date | Due Date |\n';
            markdown += '|----------|----------|----------|-------------|----------|\n';

            for (const assignment of activeAssignments.slice(0, 10)) {
                const [, issueId] = assignment.id.split(':');
                markdown += `| ${assignment.assignee} | ${issueId} | ${assignment.priority} | ${new Date(assignment.assignedAt).toLocaleDateString()} | ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'N/A'} |\n`;
            }
        }

        return markdown;
    }

    /**
     * Save annotations to file
     */
    async saveAnnotations() {
        const data = {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            annotations: Object.fromEntries(this.annotations),
        };

        await fs.writeFile(this.annotationsFile, JSON.stringify(data, null, 2), 'utf8');
    }

    /**
     * Save suppressions to file
     */
    async saveSuppressions() {
        const data = {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            suppressions: Object.fromEntries(this.suppressions),
        };

        await fs.writeFile(this.suppressionsFile, JSON.stringify(data, null, 2), 'utf8');
    }

    /**
     * Save assignments to file
     */
    async saveAssignments() {
        const data = {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            assignments: Object.fromEntries(this.assignments),
        };

        await fs.writeFile(this.assignmentsFile, JSON.stringify(data, null, 2), 'utf8');
    }

    /**
     * Generate unique annotation ID
     */
    generateAnnotationId() {
        return `annotation_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate unique assignment ID
     */
    generateAssignmentId() {
        return `assignment_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate unique suppression ID
     */
    generateSuppressionId() {
        return `suppression_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Update annotation status
     */
    async updateAnnotationStatus(annotationId, status, metadata = {}) {
        const annotation = this.annotations.get(annotationId);
        if (!annotation) {
            return { success: false, error: 'Annotation not found' };
        }

        annotation.status = status;
        annotation.updatedAt = new Date().toISOString();
        annotation.metadata = { ...annotation.metadata, ...metadata };

        this.annotations.set(annotationId, annotation);
        await this.saveAnnotations();

        return {
            success: true,
            annotationId,
            status,
            annotation,
        };
    }

    /**
     * Update assignment status
     */
    async updateAssignmentStatus(assignmentId, status, metadata = {}) {
        for (const [key, assignment] of this.assignments) {
            if (assignment.id === assignmentId) {
                assignment.status = status;
                assignment.metadata = { ...assignment.metadata, ...metadata };

                if (status === 'completed') {
                    assignment.completedAt = new Date().toISOString();
                }

                this.assignments.set(key, assignment);
                await this.saveAssignments();

                return {
                    success: true,
                    assignmentId,
                    status,
                    assignment,
                };
            }
        }

        return { success: false, error: 'Assignment not found' };
    }

    /**
     * Clear all data
     */
    async clearAllData() {
        this.annotations.clear();
        this.suppressions.clear();
        this.assignments.clear();

        try {
            await Promise.all([
                fs.unlink(this.annotationsFile).catch(() => { }),
                fs.unlink(this.suppressionsFile).catch(() => { }),
                fs.unlink(this.assignmentsFile).catch(() => { }),
            ]);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default TeamAnnotations;
