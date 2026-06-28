import type { EvidenceTimelineEdge, EvidenceTimelineNode, TutorState } from './types.js';

export type EvidenceTimeline = {
  summary: Record<string, number>;
  nodes: EvidenceTimelineNode[];
  edges: EvidenceTimelineEdge[];
};

export type BuildEvidenceTimelineOptions = {
  includeEvents?: boolean;
  courseId?: string;
};

export function buildEvidenceTimeline(state: TutorState, options: BuildEvidenceTimelineOptions = {}): EvidenceTimeline {
  const includeEvents = options.includeEvents ?? true;
  const nodes = new Map<string, EvidenceTimelineNode>();
  const edges: EvidenceTimelineEdge[] = [];
  const addNode = (node: EvidenceTimelineNode) => nodes.set(node.id, { ...nodes.get(node.id), ...node });
  const addEdge = (from: string, to: string, type: EvidenceTimelineEdge['type']) => edges.push({ from, to, type });

  for (const artifact of state.artifacts) {
    const commitId = `commit:${artifact.externalId}`;
    addNode({ id: commitId, type: 'commit', label: artifact.title, subtitle: artifact.externalId.slice(0, 8), createdAt: artifact.committedAt });
    for (const file of artifact.changedFiles) {
      const nodeId = pathNodeId(file);
      addNode({ id: nodeId, type: isMarkdown(file) ? 'doc' : 'file', label: file.split('/').at(-1) ?? file, path: file, subtitle: isMarkdown(file) ? 'markdown learning material' : 'changed file' });
      addEdge(commitId, nodeId, 'changed');
    }
  }

  for (const concept of state.concepts) {
    const conceptId = `concept:${concept.id}`;
    addNode({ id: conceptId, type: 'concept', label: concept.label, subtitle: concept.kind, status: concept.difficulty });
    for (const evidence of concept.evidence.slice(0, 6)) {
      const evidenceNodeId = pathNodeId(evidence.path);
      addNode({ id: evidenceNodeId, type: isMarkdown(evidence.path) ? 'doc' : 'file', label: evidence.path.split('/').at(-1) ?? evidence.path, path: evidence.path });
      addEdge(evidenceNodeId, conceptId, 'mentions');
      if (evidence.commit) addEdge(`commit:${evidence.commit}`, conceptId, 'teaches');
    }
  }

  for (const course of state.courses) {
    const courseId = `course:${course.id}`;
    addNode({ id: courseId, type: 'course', label: course.title, subtitle: course.goal, createdAt: course.createdAt });
    for (const doc of course.docPaths) {
      const docId = pathNodeId(doc);
      addNode({ id: docId, type: 'doc', label: labelForPath(doc), path: doc, subtitle: doc.includes('*') ? 'course material pattern' : 'course material' });
      addEdge(courseId, docId, 'uses_evidence');
    }
    for (const conceptId of course.conceptIds) addEdge(courseId, `concept:${conceptId}`, 'teaches');
  }

  for (const question of state.questionBank) {
    const questionId = `question:${question.id}`;
    addNode({ id: questionId, type: 'question', label: question.prompt, subtitle: `${question.status} · ${question.author.provider}`, createdAt: question.createdAt, status: question.status });
    addEdge(`concept:${question.conceptId}`, questionId, 'drafted');
    if (question.courseId) addEdge(`course:${question.courseId}`, questionId, 'drafted');
    for (const evidence of question.evidence.slice(0, 3)) addEdge(pathNodeId(evidence.path), questionId, 'uses_evidence');
  }

  for (const batch of state.cardBatches) {
    const batchId = `batch:${batch.id}`;
    addNode({ id: batchId, type: 'batch', label: batch.mode, subtitle: `${batch.itemIds.length} cards`, createdAt: batch.createdAt });
    for (const itemId of batch.itemIds) addEdge(batchId, `card:${itemId}`, 'generated');
  }

  for (const item of state.learningItems) {
    const cardId = `card:${item.id}`;
    addNode({ id: cardId, type: 'card', label: item.title, subtitle: item.questionPlane, createdAt: item.createdAt, status: item.status });
    addEdge(`concept:${item.conceptId}`, cardId, 'schedules');
    if (item.courseId) addEdge(`course:${item.courseId}`, cardId, 'schedules');
    if (item.questionId) addEdge(`question:${item.questionId}`, cardId, 'schedules');
    addEdge(pathNodeId(item.snippet.path), cardId, 'uses_evidence');
  }

  if (includeEvents) {
    for (const event of state.learningEvents) {
      const eventId = `event:${event.id}`;
      addNode({ id: eventId, type: 'event', label: event.eventType, subtitle: event.correct === undefined ? undefined : event.correct ? 'correct' : 'missed', createdAt: event.createdAt });
      addEdge(`card:${event.itemId}`, eventId, 'answered');
    }
  }

  let resultNodes = [...nodes.values()];
  let resultEdges = uniqueEdges(edges);
  if (options.courseId) {
    const scoped = filterTimelineForCourse(resultNodes, resultEdges, options.courseId);
    resultNodes = scoped.nodes;
    resultEdges = scoped.edges;
  }
  return {
    summary: summarize(resultNodes),
    nodes: resultNodes.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.type.localeCompare(b.type)),
    edges: resultEdges,
  };
}

export function graphByType(timeline: EvidenceTimeline): Array<{ type: string; nodes: EvidenceTimelineNode[] }> {
  const groups = new Map<string, EvidenceTimelineNode[]>();
  for (const node of timeline.nodes) groups.set(node.type, [...(groups.get(node.type) ?? []), node]);
  return [...groups.entries()].map(([type, nodes]) => ({ type, nodes }));
}

function filterTimelineForCourse(nodes: EvidenceTimelineNode[], edges: EvidenceTimelineEdge[], courseId: string): { nodes: EvidenceTimelineNode[]; edges: EvidenceTimelineEdge[] } {
  const courseNodeId = `course:${courseId}`;
  const keep = new Set<string>();
  const queue = [courseNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (keep.has(current)) continue;
    keep.add(current);
    for (const edge of edges) {
      if (edge.from === current && !keep.has(edge.to)) queue.push(edge.to);
      if (edge.to === current && !keep.has(edge.from)) queue.push(edge.from);
    }
  }
  for (const node of nodes) {
    if (node.type === 'concept' && edges.some((edge) => edge.from === courseNodeId && edge.to === node.id)) keep.add(node.id);
    if (node.type === 'question' && node.id.startsWith('question:')) {
      const qId = node.id.slice('question:'.length);
      if (edges.some((edge) => edge.from === courseNodeId && edge.to === node.id)) keep.add(node.id);
      const cardEdge = edges.find((edge) => edge.from.startsWith('question:') && edge.to.startsWith('card:'));
      if (cardEdge) keep.add(cardEdge.to);
    }
    if (node.type === 'card' && edges.some((edge) => edge.from === courseNodeId && edge.to === node.id)) keep.add(node.id);
  }
  const filteredNodes = nodes.filter((node) => keep.has(node.id));
  const filteredIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => filteredIds.has(edge.from) && filteredIds.has(edge.to));
  return { nodes: filteredNodes, edges: filteredEdges };
}

function pathNodeId(path: string): string {
  return `${isMarkdown(path) ? 'doc' : 'file'}:${path}`;
}

function labelForPath(path: string): string {
  return path.includes('*') ? path : path.split('/').at(-1) ?? path;
}

function isMarkdown(path: string): boolean {
  return /(^|\/)README\.md$/i.test(path) || /\.mdx?$/i.test(path) || path.includes('docs/');
}

function summarize(nodes: EvidenceTimelineNode[]): Record<string, number> {
  return nodes.reduce<Record<string, number>>((summary, node) => ({ ...summary, [node.type]: (summary[node.type] ?? 0) + 1 }), {});
}

function uniqueEdges(edges: EvidenceTimelineEdge[]): EvidenceTimelineEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}:${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
