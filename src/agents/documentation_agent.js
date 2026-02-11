export async function generateDocumentation(fixRes, errors) {
  const notes = [];
  const changeLog = [];
  if ((errors || []).length === 0) {
    notes.push('No issues detected; no documentation changes required.');
  } else {
    errors.forEach((e) => {
      notes.push(`Fix planned for ${e.category}: ${e.issue}`);
    });
  }
  if (fixRes?.proposals?.length) {
    const top = fixRes.proposals[0];
    changeLog.push(`Applied minimal fix; confidence=${top.confidence ?? 'n/a'}`);
  }
  return { notes, changeLog, versionNote: 'Automated agent pass' };
}
