import {
  buildCheckAnnotations,
  normalizeAnnotationPath,
  severityToAnnotationLevel,
} from '../src/utils/prIntelligence.js';

describe('PR annotation payload generation', () => {
  test('normalizeAnnotationPath converts windows paths', () => {
    expect(normalizeAnnotationPath('.\\src\\api\\auth.js')).toBe('src/api/auth.js');
  });

  test('severityToAnnotationLevel maps correctly', () => {
    expect(severityToAnnotationLevel('critical')).toBe('failure');
    expect(severityToAnnotationLevel('high')).toBe('failure');
    expect(severityToAnnotationLevel('medium')).toBe('warning');
    expect(severityToAnnotationLevel('low')).toBe('warning');
    expect(severityToAnnotationLevel('info')).toBe('notice');
  });

  test('buildCheckAnnotations builds valid payload and skips invalid entries', () => {
    const annotations = buildCheckAnnotations([
      {
        file: './src/api/auth.js',
        line: 22,
        severity: 'high',
        type: 'SQL Injection',
        message: 'Potential SQL injection found',
      },
      {
        file: null,
        line: 3,
        severity: 'low',
        type: 'Ignored',
        message: 'Should be dropped',
      },
      {
        file: 'src/app.js',
        line: 0,
        severity: 'medium',
        type: 'Bad line',
        message: 'Should be dropped due to invalid line',
      },
    ]);

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toEqual({
      path: 'src/api/auth.js',
      start_line: 22,
      end_line: 22,
      annotation_level: 'failure',
      title: 'SQL Injection',
      message: 'Potential SQL injection found',
    });
  });

  test('buildCheckAnnotations respects annotation limit', () => {
    const issues = Array.from({ length: 75 }).map((_, idx) => ({
      file: 'src/index.js',
      line: idx + 1,
      severity: 'low',
      type: `Issue-${idx}`,
      message: `Message-${idx}`,
    }));

    const annotations = buildCheckAnnotations(issues, { limit: 50 });
    expect(annotations).toHaveLength(50);
  });
});
